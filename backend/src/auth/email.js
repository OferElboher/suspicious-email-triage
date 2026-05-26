/**
 * Password-reset email delivery via SMTP.
 *
 * Dev default (SMTP_DELIVERY=mailpit): Mailpit catches mail locally (UI :8025).
 * Real delivery (SMTP_DELIVERY=external): configure provider credentials in gitignored backend/.env.
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

/** Build a nodemailer transport from SMTP_* env vars (no auth for Mailpit). */
function buildTransport() {
  if (!smtpConfigured()) {
    return null;
  }
  const isMailpit = smtpDeliveryMode() === "mailpit";
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || (isMailpit ? 1025 : 587)),
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || "" }
      : undefined,
  });
}

/**
 * Send forgot-password email. Returns { delivered, resetUrl?, deliveryMode }.
 * When SMTP is off, resetUrl is still returned for dev logging (see logger + auth route).
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

  await transport.sendMail({
    from: process.env.SMTP_FROM || "noreply@local.test",
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
}

module.exports = {
  sendPasswordResetEmail,
  smtpConfigured,
  smtpDeliveryMode,
  buildTransport,
};
