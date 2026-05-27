/**
 * Password-reset email delivery.
 *
 * EMAIL_DELIVERY modes (EMAIL_DELIVERY or legacy SMTP_DELIVERY):
 *   mailpit      — local Mailpit sink (default dev)
 *   google_oauth — Gmail API via Sign in with Google OAuth (no App Passwords)
 *   external     — legacy SMTP username/password (discouraged for Gmail)
 */
const nodemailer = require("nodemailer");
const logger = require("../lib/logger");
const { isDevDeployment } = require("../config/runtime");
const { googleOAuthEmailConfigured, sendViaGmailApi } = require("./gmailApi");

/** @returns {"mailpit"|"google_oauth"|"external"} Active delivery mode. */
function emailDeliveryMode() {
  const raw = String(
    process.env.EMAIL_DELIVERY || process.env.SMTP_DELIVERY || "mailpit"
  ).toLowerCase();
  if (raw === "google_oauth" || raw === "google-oauth") return "google_oauth";
  if (raw === "external") return "external";
  return "mailpit";
}

/** Back-compat alias used by tests and guardrails. */
function smtpDeliveryMode() {
  return emailDeliveryMode();
}

/** Return true when the selected delivery mode has required configuration. */
function emailConfigured() {
  const mode = emailDeliveryMode();
  if (mode === "google_oauth") return googleOAuthEmailConfigured();
  if (mode === "external") {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  }
  return Boolean(process.env.SMTP_HOST);
}

/** Back-compat alias. */
function smtpConfigured() {
  return emailConfigured();
}

/** Hint text when SMTP password auth fails (Gmail App Password confusion). */
function smtpErrorHint(err, mode) {
  const msg = String(err?.message || err || "");
  if (mode !== "external") return undefined;
  if (/535|BadCredentials|EAUTH|authentication/i.test(msg)) {
    return (
      "SMTP password auth failed. Prefer EMAIL_DELIVERY=google_oauth " +
      "(bash scripts/configure-dev-google-oauth.sh email) or Mailpit for local dev."
    );
  }
  if (/self signed|certificate|TLS/i.test(msg)) {
    return "TLS issue — try SMTP_PORT=587 with SMTP_SECURE=false, or switch to google_oauth.";
  }
  return undefined;
}

/** Build nodemailer transport for mailpit/external SMTP modes only. */
function buildTransport() {
  const mode = emailDeliveryMode();
  if (mode === "google_oauth" || !emailConfigured()) return null;
  const isMailpit = mode === "mailpit";
  const port = Number(process.env.SMTP_PORT || (isMailpit ? 1025 : 587));
  const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    requireTLS: !isMailpit && !secure && port === 587,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || "" }
      : undefined,
  });
}

/**
 * Send forgot-password email. Never throws — callers return HTTP 200 (no enumeration).
 */
async function sendPasswordResetEmail({ email, resetToken }) {
  const appUrl = (process.env.APP_PUBLIC_URL || "http://localhost:3001").replace(/\/$/, "");
  const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;
  const subject = "Reset your triage account password";
  const text = [
    "You requested a password reset for the Suspicious Email Triage application.",
    "",
    `Open this link to choose a new password: ${resetUrl}`,
    "",
    "If you did not request this, you can ignore this email.",
  ].join("\n");

  const mode = emailDeliveryMode();
  if (!emailConfigured()) {
    logger.warn("auth", "password reset email not sent (email not configured)", {
      email,
      resetUrl,
      deliveryMode: mode,
    });
    return { delivered: false, resetUrl, deliveryMode: mode };
  }

  try {
    if (mode === "google_oauth") {
      await sendViaGmailApi({ to: email, subject, text });
      return { delivered: true, resetUrl, deliveryMode: mode };
    }

    const transport = buildTransport();
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@local.test",
      to: email,
      subject,
      text,
    });
    logger.info("auth", "password reset email sent", {
      email,
      deliveryMode: mode,
      resetUrl: isDevDeployment() && mode === "mailpit" ? resetUrl : undefined,
    });
    return { delivered: true, resetUrl, deliveryMode: mode };
  } catch (err) {
    const hint =
      mode === "external"
        ? smtpErrorHint(err, mode)
        : "Run bash scripts/configure-dev-google-oauth.sh email to refresh Google OAuth tokens.";
    logger.error("auth", "password reset email delivery failed", {
      email,
      deliveryMode: mode,
      error: err.message,
      hint,
    });
    return { delivered: false, resetUrl, deliveryMode: mode, error: err.message, hint };
  }
}

module.exports = {
  sendPasswordResetEmail,
  emailDeliveryMode,
  emailConfigured,
  smtpDeliveryMode,
  smtpConfigured,
  smtpErrorHint,
  buildTransport,
};
