/**
 * Google OAuth2 sign-in for the triage app (OpenID Connect style, no App Passwords).
 *
 * Uses authorization-code flow; maps Google email to existing auth_users rows and issues JWT.
 */
const crypto = require("crypto");
const { signAccessToken, jwtTtlSeconds } = require("./jwt");
const { findUserByEmail, loadUserAccess } = require("./authPg");

/** In-memory OAuth state store (dev/demo — production would use Redis with TTL). */
const pendingStates = new Map();

/** Return true when Google login OAuth env is configured. */
function googleLoginEnabled() {
  return (
    String(process.env.GOOGLE_LOGIN_ENABLED || "false").toLowerCase() === "true" &&
    Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET)
  );
}

/** Public redirect URI registered in Google Cloud Console. */
function googleLoginRedirectUri() {
  return (
    process.env.GOOGLE_LOGIN_REDIRECT_URI ||
    "http://localhost:3000/auth/google/callback"
  );
}

/** Build Google authorization URL for the login button. */
function buildGoogleLoginUrl() {
  const state = crypto.randomBytes(24).toString("hex");
  pendingStates.set(state, Date.now());
  // Expire stale states (>10 min) opportunistically.
  for (const [key, ts] of pendingStates) {
    if (Date.now() - ts > 600_000) pendingStates.delete(key);
  }
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
    redirect_uri: googleLoginRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state,
  });
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, state };
}

/** Validate OAuth state parameter to mitigate CSRF on callback. */
function consumeOAuthState(state) {
  if (!state || !pendingStates.has(state)) return false;
  pendingStates.delete(state);
  return true;
}

/** Exchange authorization code for tokens and fetch Google user profile. */
async function exchangeCodeForProfile(code) {
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirect_uri: googleLoginRedirectUri(),
      grant_type: "authorization_code",
    }).toString(),
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(tokenData.error_description || tokenData.error || "Google token exchange failed");
  }
  const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const profile = await profileRes.json();
  if (!profileRes.ok || !profile.email) {
    throw new Error("Google userinfo missing email");
  }
  return { email: String(profile.email).toLowerCase(), name: profile.name || profile.email };
}

/**
 * Complete Google login: verify user exists in auth_users and return JWT payload for SPA.
 */
async function loginWithGoogleProfile(profile) {
  const user = await findUserByEmail(profile.email);
  if (!user || !user.is_active) {
    return { error: "google_user_not_provisioned", email: profile.email };
  }
  const access = await loadUserAccess(user.id);
  const token = signAccessToken({ sub: user.id, email: user.email });
  return {
    token,
    expiresIn: jwtTtlSeconds(),
    user: {
      id: user.id,
      email: user.email,
      roles: access.roles,
      permissions: access.permissions,
    },
  };
}

module.exports = {
  googleLoginEnabled,
  buildGoogleLoginUrl,
  consumeOAuthState,
  exchangeCodeForProfile,
  loginWithGoogleProfile,
  googleLoginRedirectUri,
};
