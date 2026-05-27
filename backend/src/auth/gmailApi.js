/**
 * Gmail API email delivery using Google OAuth2 refresh tokens (no App Passwords).
 *
 * Scope required at consent time: https://www.googleapis.com/auth/gmail.send
 * Setup: bash scripts/configure-dev-google-oauth.sh email
 */
const logger = require("../lib/logger");

/** Return true when Google OAuth env vars for Gmail send are present. */
function googleOAuthEmailConfigured() {
  return Boolean(
    process.env.GOOGLE_OAUTH_CLIENT_ID &&
      process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
      process.env.GOOGLE_OAUTH_REFRESH_TOKEN &&
      process.env.GOOGLE_OAUTH_SENDER_EMAIL
  );
}

/** Exchange a long-lived refresh token for a short-lived access token. */
async function fetchAccessToken() {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Google token refresh failed");
  }
  return data.access_token;
}

/** Build RFC 822 plain-text message and base64url-encode for Gmail API `raw` field. */
function buildRawMessage({ from, to, subject, text }) {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    text,
  ];
  return Buffer.from(lines.join("\r\n"), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Send email via Gmail REST API (Sign in with Google OAuth — no SMTP App Password).
 * @returns {Promise<void>}
 */
async function sendViaGmailApi({ to, subject, text }) {
  const from = process.env.GOOGLE_OAUTH_SENDER_EMAIL;
  const accessToken = await fetchAccessToken();
  const raw = buildRawMessage({ from, to, subject, text });
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error?.message || `Gmail API send failed (${res.status})`);
  }
  logger.info("auth", "password reset email sent via Gmail API (google_oauth)", { to });
}

module.exports = { googleOAuthEmailConfigured, sendViaGmailApi, fetchAccessToken };
