const express = require("express");
const logger = require("../lib/logger");
const { signAccessToken, jwtTtlSeconds } = require("../auth/jwt");
const {
  authenticateUser,
  findUserById,
  loadUserAccess,
  createPasswordResetToken,
  resetPasswordWithToken,
} = require("../auth/authPg");
const { sendPasswordResetEmail } = require("../auth/email");
const { isDevDeployment } = require("../config/runtime");
const { authenticate } = require("../http/middleware/auth");

const router = express.Router();

router.post("/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim();
    const password = String(req.body.password || "");
    if (!email || !password) {
      return res.status(400).json({ error: "email_and_password_required" });
    }
    const user = await authenticateUser(email, password);
    if (!user) {
      return res.status(401).json({ error: "invalid_credentials" });
    }
    const token = signAccessToken({ sub: user.id, email: user.email });
    res.json({
      token,
      expiresIn: jwtTtlSeconds(),
      user: {
        id: user.id,
        email: user.email,
        roles: user.roles,
        permissions: user.permissions,
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
      if (isDevDeployment() && !delivery.delivered && delivery.resetUrl) {
        logger.warn("auth", "dev password reset link", {
          email: reset.email,
          resetUrl: delivery.resetUrl,
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
    res.json({
      user: {
        id: user.id,
        email: user.email,
        roles: access.roles,
        permissions: access.permissions,
        isActive: user.is_active,
      },
    });
  } catch (err) {
    logger.error("auth", "me failed", { error: err.message });
    res.status(500).json({ error: "profile_failed" });
  }
});

module.exports = router;
