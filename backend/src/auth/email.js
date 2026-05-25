const nodemailer = require("nodemailer");
const logger = require("../lib/logger");

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST);
}

function buildTransport() {
  if (!smtpConfigured()) {
    return null;
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || "" }
      : undefined,
  });
}

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

  const transport = buildTransport();
  if (!transport) {
    logger.warn("auth", "password reset email not sent (SMTP not configured)", {
      email,
      resetUrl,
    });
    return { delivered: false, resetUrl };
  }

  await transport.sendMail({
    from: process.env.SMTP_FROM || "noreply@local.test",
    to: email,
    subject,
    text,
  });
  logger.info("auth", "password reset email sent", { email });
  return { delivered: true };
}

module.exports = { sendPasswordResetEmail, smtpConfigured };
