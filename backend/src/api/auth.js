const express = require("express");
const logger = require("../lib/logger");
const { signAccessToken, jwtTtlSeconds } = require("../auth/jwt");
const {
  authenticateUser,
  findUserById,
  loadUserAccess,
  createPasswordResetToken,
  resetPasswordWithToken,
  getUserUiTheme,
  setUserUiTheme,
  bootstrapCredentialsFromEnv,
  resetBootstrapAdminForDev,
} = require("../auth/authPg");
const { UI_THEMES, DEFAULT_UI_THEME, isValidUiTheme } = require("../auth/themeConstants");
const { sendPasswordResetEmail } = require("../auth/email");
const {
  googleLoginEnabled,
  buildGoogleLoginUrl,
  consumeOAuthState,
  exchangeCodeForProfile,
  loginWithGoogleProfile,
} = require("../auth/googleLogin");
const { isDevDeployment } = require("../config/runtime");
const { authenticate } = require("../http/middleware/auth");

const router = express.Router();

/** Mask email for login hints without exposing the full address in API responses. */
function maskBootstrapEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized.includes("@")) {
    return null;
  }
  const [local, domain] = normalized.split("@");
  if (!local || !domain) {
    return null;
  }
  const visible = local.length <= 2 ? `${local[0] || "*"}*` : `${local.slice(0, 2)}***`;
  return `${visible}@${domain}`;
}

/** Public auth capabilities for the SPA (Google button visibility, delivery mode hints). */
router.get("/config", (req, res) => {
  const dev = isDevDeployment();
  const { email, password } = bootstrapCredentialsFromEnv();
  const emailConfigured = Boolean(email && !email.endsWith("@local.test"));
  res.json({
    googleLoginEnabled: googleLoginEnabled(),
    emailDelivery: process.env.EMAIL_DELIVERY || process.env.SMTP_DELIVERY || "mailpit",
    devLoginAssist: dev,
    bootstrapEmailConfigured: emailConfigured,
    maskedBootstrapEmail: emailConfigured ? maskBootstrapEmail(email) : null,
    bootstrapPasswordHint: dev ? password : null,
  });
});

/**
 * POST /auth/dev/bootstrap-reset — dev only, no JWT.
 * Resets bootstrap admin password to AUTH_BOOTSTRAP_* (fixes post-rebuild login).
 */
router.post("/dev/bootstrap-reset", async (req, res) => {
  if (!isDevDeployment()) {
    return res.status(403).json({ error: "dev_only" });
  }
  try {
    const result = await resetBootstrapAdminForDev();
    if (!result.ok) {
      return res.status(400).json(result);
    }
    const { password } = bootstrapCredentialsFromEnv();
    return res.json({
      ok: true,
      action: result.action,
      email: result.email,
      message:
        "Bootstrap admin is ready. Sign in with the configured email and dev password from backend/.env.dev.",
      passwordHint: password,
    });
  } catch (err) {
    logger.error("auth", "dev bootstrap reset failed", { error: err.message });
    return res.status(500).json({ error: "bootstrap_reset_failed" });
  }
});

/** Redirect browser to Google OAuth consent (Sign in with Google). */
router.get("/google/start", (req, res) => {
  if (!googleLoginEnabled()) {
    return res.status(503).json({
      error: "google_login_disabled",
      hint: "Run bash scripts/configure-dev-google-oauth.sh login",
    });
  }
  const { url } = buildGoogleLoginUrl();
  res.redirect(url);
});

/** Google OAuth callback — issue JWT and redirect to SPA with token. */
router.get("/google/callback", async (req, res) => {
  try {
    if (!googleLoginEnabled()) {
      return res.status(503).json({ error: "google_login_disabled" });
    }
    const code = String(req.query.code || "");
    const state = String(req.query.state || "");
    if (!code || !consumeOAuthState(state)) {
      return res.status(400).json({ error: "invalid_oauth_state" });
    }
    const profile = await exchangeCodeForProfile(code);
    const result = await loginWithGoogleProfile(profile);
    const appUrl = (process.env.APP_PUBLIC_URL || "http://localhost:3001").replace(/\/$/, "");
    if (result.error) {
      const q = new URLSearchParams({ error: result.error, email: result.email || "" });
      return res.redirect(`${appUrl}/?${q.toString()}`);
    }
    const q = new URLSearchParams({
      googleToken: result.token,
      expiresIn: String(result.expiresIn),
    });
    res.redirect(`${appUrl}/?${q.toString()}`);
  } catch (err) {
    logger.error("auth", "google callback failed", { error: err.message });
    res.status(500).json({ error: "google_login_failed" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!email || !password) {
      return res.status(400).json({ error: "email_and_password_required" });
    }
    const user = await authenticateUser(email, password);
    if (!user) {
      return res.status(401).json({ error: "invalid_credentials" });
    }
    const token = signAccessToken({ sub: user.id, email: user.email });
    const uiTheme = await getUserUiTheme(user.id);
    res.json({
      token,
      expiresIn: jwtTtlSeconds(),
      user: {
        id: user.id,
        email: user.email,
        roles: user.roles,
        permissions: user.permissions,
        uiTheme,
      },
    });
  } catch (err) {
    logger.error("auth", "login failed", { error: err.message });
    res.status(500).json({ error: "login_failed" });
  }
});

router.post("/forgot-password", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim();
    if (!email) {
      return res.status(400).json({ error: "email_required" });
    }
    const reset = await createPasswordResetToken(email);
    if (reset) {
      const delivery = await sendPasswordResetEmail({
        email: reset.email,
        resetToken: reset.token,
      });
      // Dev convenience: log reset link when Mailpit is off or external SMTP failed (token still created in Postgres).
      if (isDevDeployment() && !delivery.delivered && delivery.resetUrl) {
        logger.warn("auth", "dev password reset link", {
          email: reset.email,
          resetUrl: delivery.resetUrl,
          deliveryMode: delivery.deliveryMode,
          smtpError: delivery.error,
          hint: delivery.hint,
        });
      }
      if (!delivery.delivered && delivery.error) {
        logger.warn("auth", "password reset token created but email not delivered", {
          email: reset.email,
          deliveryMode: delivery.deliveryMode,
          error: delivery.error,
          hint: delivery.hint,
        });
      }
    }
    res.json({
      ok: true,
      message:
        "If an account exists for that email, password reset instructions were sent.",
    });
  } catch (err) {
    logger.error("auth", "forgot password failed", { error: err.message });
    res.status(500).json({ error: "forgot_password_failed" });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const token = String(req.body.token || "").trim();
    const password = String(req.body.password || "");
    if (!token || !password) {
      return res.status(400).json({ error: "token_and_password_required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "password_too_short" });
    }
    const ok = await resetPasswordWithToken(token, password);
    if (!ok) {
      return res.status(400).json({ error: "invalid_or_expired_token" });
    }
    res.json({ ok: true, message: "Password updated. You can sign in now." });
  } catch (err) {
    logger.error("auth", "reset password failed", { error: err.message });
    res.status(500).json({ error: "reset_password_failed" });
  }
});

router.get("/me", authenticate, async (req, res) => {
  try {
    const user = await findUserById(req.auth.userId);
    if (!user) {
      return res.status(401).json({ error: "invalid_token" });
    }
    const access = await loadUserAccess(user.id);
    const uiTheme = user.ui_theme || (await getUserUiTheme(user.id));
    res.json({
      user: {
        id: user.id,
        email: user.email,
        roles: access.roles,
        permissions: access.permissions,
        isActive: user.is_active,
        uiTheme,
      },
    });
  } catch (err) {
    logger.error("auth", "me failed", { error: err.message });
    res.status(500).json({ error: "profile_failed" });
  }
});

/** GET /auth/preferences — UI preferences (theme catalog + current selection). */
router.get("/preferences", authenticate, async (req, res) => {
  try {
    const uiTheme = await getUserUiTheme(req.auth.userId);
    res.json({
      uiTheme,
      themes: UI_THEMES,
      defaultTheme: DEFAULT_UI_THEME,
    });
  } catch (err) {
    logger.error("auth", "preferences get failed", { error: err.message });
    res.status(500).json({ error: "preferences_failed" });
  }
});

/** PUT /auth/preferences — persist UI theme per user in PostgreSQL auth_users.ui_theme. */
router.put("/preferences", authenticate, async (req, res) => {
  try {
    const uiTheme = String(req.body.uiTheme || "").trim();
    if (!isValidUiTheme(uiTheme)) {
      return res.status(400).json({ error: "invalid_ui_theme", allowed: UI_THEMES.map((t) => t.id) });
    }
    const saved = await setUserUiTheme(req.auth.userId, uiTheme);
    res.json({ ok: true, uiTheme: saved });
  } catch (err) {
    logger.error("auth", "preferences put failed", { error: err.message });
    res.status(500).json({ error: "preferences_failed" });
  }
});

module.exports = router;
