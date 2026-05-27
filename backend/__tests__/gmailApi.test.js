/** Jest tests for Gmail API OAuth email delivery (mocked HTTP). */

const { googleOAuthEmailConfigured, sendViaGmailApi } = require("../src/auth/gmailApi");

describe("gmailApi", () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  test("googleOAuthEmailConfigured requires OAuth env vars", () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    expect(googleOAuthEmailConfigured()).toBe(false);
    process.env.GOOGLE_OAUTH_CLIENT_ID = "id";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "secret";
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN = "refresh";
    process.env.GOOGLE_OAUTH_SENDER_EMAIL = "you@gmail.com";
    expect(googleOAuthEmailConfigured()).toBe(true);
  });

  test("sendViaGmailApi refreshes token and posts to Gmail API", async () => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = "id";
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = "secret";
    process.env.GOOGLE_OAUTH_REFRESH_TOKEN = "refresh";
    process.env.GOOGLE_OAUTH_SENDER_EMAIL = "sender@gmail.com";

    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "access-123" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "msg-1" }),
      });

    await sendViaGmailApi({
      to: "user@example.com",
      subject: "Reset",
      text: "Hello",
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[1][0]).toContain("gmail.googleapis.com");
  });
});
