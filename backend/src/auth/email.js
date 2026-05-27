/**
 * Password-reset email delivery via SMTP (nodemailer).
 *
 * SMTP_DELIVERY=mailpit — local Mailpit sink (default dev, UI :8025).
 * SMTP_DELIVERY=external — real provider (Gmail App Password, SendGrid, etc.) via backend/.env.
 */
const nodemailer = require("nodemailer");
const logger = require("../lib/logger");
const { isDevDeployment } = require("../config/runtime");

/** @returns {"mailpit"|"external"} Delivery mode from SMTP_DELIVERY (default mailpit). */
function smtpDeliveryMode() {
  const raw = String(process.env.SMTP_DELIVERY || "mailpit").toLowerCase();
  return raw === "external" ? "external" : "mailpit";
}

/** Return true when outbound SMTP is configured for the active delivery mode. */
function smtpConfigured() {
  if (smtpDeliveryMode() === "external") {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  }
  return Boolean(process.env.SMTP_HOST);
}

/**
 * Human-readable hint when SMTP send fails (Gmail app password vs triage password confusion).
 * @param {Error|{message?: string}} err
 * @param {"mailpit"|"external"} mode
 */
function smtpErrorHint(err, mode) {
  const msg = String(err?.message || err || "");
  if (mode !== "external") {
    return undefined;
  }
  if (/535|BadCredentials|EAUTH|authentication/i.test(msg)) {
    return (
      "SMTP authentication failed. For Gmail use a 16-character App Password " +
      "(Google Account → Security → 2-Step Verification → App passwords), " +
      "not AUTH_BOOTSTRAP_ADMIN_PASSWORD or your triage login password."
    );
  }
  if (/self signed|certificate|TLS/i.test(msg)) {
    return "TLS/ certificate issue — try SMTP_PORT=587 with SMTP_SECURE=false (STARTTLS).";
  }
  return undefined;
}

/** Build a nodemailer transport from SMTP_* env vars. Mailpit needs no auth; Gmail uses STARTTLS on 587. */
function buildTransport() {
  if (!smtpConfigured()) {
    return null;
  }
  const isMailpit = smtpDeliveryMode() === "mailpit";
  const port = Number(process.env.SMTP_PORT || (isMailpit ? 1025 : 587));
  const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    // Port 587: upgrade plain connection with STARTTLS (Gmail, SendGrid, most providers).
    requireTLS: !isMailpit && !secure && port === 587,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || "" }
      : undefined,
  });
}

/**
 * Send forgot-password email.
 * @returns {Promise<{delivered: boolean, resetUrl: string, deliveryMode: string, error?: string, hint?: string}>}
 * Never throws on SMTP failure — callers keep HTTP 200 for forgot-password (no account enumeration).
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

  const mode = smtpDeliveryMode();
  const transport = buildTransport();
  if (!transport) {
    logger.warn("auth", "password reset email not sent (SMTP not configured)", {
      email,
      resetUrl,
      deliveryMode: mode,
    });
    return { delivered: false, resetUrl, deliveryMode: mode };
  }

  try {
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
    const hint = smtpErrorHint(err, mode);
    logger.error("auth", "password reset email delivery failed", {
      email,
      deliveryMode: mode,
      error: err.message,
      hint,
    });
    return {
      delivered: false,
      resetUrl,
      deliveryMode: mode,
      error: err.message,
      hint,
    };
  }
}

module.exports = {
  sendPasswordResetEmail,
  smtpConfigured,
  smtpDeliveryMode,
  smtpErrorHint,
  buildTransport,
};
