/** Jest tests for password-reset email delivery (Mailpit and external SMTP). */

jest.mock("nodemailer", () => ({
  createTransport: jest.fn(),
}));

const nodemailer = require("nodemailer");
const {
  sendPasswordResetEmail,
  smtpConfigured,
  smtpDeliveryMode,
} = require("../src/auth/email");

describe("sendPasswordResetEmail", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("smtpDeliveryMode defaults to mailpit", () => {
    delete process.env.SMTP_DELIVERY;
    expect(smtpDeliveryMode()).toBe("mailpit");
  });

  test("smtpConfigured reflects SMTP_HOST in mailpit mode", () => {
    process.env.SMTP_DELIVERY = "mailpit";
    delete process.env.SMTP_HOST;
    expect(smtpConfigured()).toBe(false);
    process.env.SMTP_HOST = "mailpit";
    expect(smtpConfigured()).toBe(true);
  });

  test("external mode requires host, user, and pass", () => {
    process.env.SMTP_DELIVERY = "external";
    process.env.SMTP_HOST = "smtp.example.com";
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    expect(smtpConfigured()).toBe(false);
    process.env.SMTP_USER = "user";
    process.env.SMTP_PASS = "secret";
    expect(smtpConfigured()).toBe(true);
  });

  test("sendMail is called when SMTP is configured (mailpit)", async () => {
    process.env.SMTP_DELIVERY = "mailpit";
    process.env.SMTP_HOST = "mailpit";
    process.env.SMTP_PORT = "1025";
    process.env.SMTP_FROM = "noreply@local.test";
    process.env.APP_PUBLIC_URL = "http://localhost:3001";

    const sendMail = jest.fn().mockResolvedValue({ messageId: "test-id" });
    nodemailer.createTransport.mockReturnValue({ sendMail });

    const result = await sendPasswordResetEmail({
      email: "admin@example.com",
      resetToken: "abc123token",
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].to).toBe("admin@example.com");
    expect(sendMail.mock.calls[0][0].text).toContain("abc123token");
    expect(result.delivered).toBe(true);
    expect(result.deliveryMode).toBe("mailpit");
  });

  test("returns resetUrl without sendMail when SMTP is unset", async () => {
    delete process.env.SMTP_HOST;
    process.env.APP_PUBLIC_URL = "http://localhost:3001";

    const result = await sendPasswordResetEmail({
      email: "admin@example.com",
      resetToken: "abc123token",
    });

    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(result.delivered).toBe(false);
    expect(result.resetUrl).toContain("abc123token");
  });
});
