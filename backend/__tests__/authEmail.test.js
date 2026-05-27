/** Jest tests for password-reset email delivery (Mailpit and external SMTP). */

jest.mock("nodemailer", () => ({
  createTransport: jest.fn(),
}));

const nodemailer = require("nodemailer");
const {
  sendPasswordResetEmail,
  smtpConfigured,
  smtpDeliveryMode,
  smtpErrorHint,
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

  test("smtpErrorHint explains Gmail app password on 535", () => {
    const hint = smtpErrorHint(
      new Error("Invalid login: 535-5.7.8 Username and Password not accepted"),
      "external"
    );
    expect(hint).toMatch(/App Password/i);
    expect(hint).not.toMatch(/temp-admin-pswd/);
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

  test("returns delivered false without throwing when sendMail fails", async () => {
    process.env.SMTP_DELIVERY = "external";
    process.env.SMTP_HOST = "smtp.gmail.com";
    process.env.SMTP_USER = "user@gmail.com";
    process.env.SMTP_PASS = "wrong";
    process.env.APP_PUBLIC_URL = "http://localhost:3001";

    const sendMail = jest.fn().mockRejectedValue(new Error("535 BadCredentials"));
    nodemailer.createTransport.mockReturnValue({ sendMail });

    const result = await sendPasswordResetEmail({
      email: "user@gmail.com",
      resetToken: "tok",
    });

    expect(result.delivered).toBe(false);
    expect(result.resetUrl).toContain("tok");
    expect(result.error).toMatch(/535/);
    expect(result.hint).toMatch(/App Password/i);
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
