const { signVerdictPayload } = require("../src/lib/verdictCallbackSign");

describe("verdictCallbackSign", () => {
  beforeEach(() => {
    process.env.VERDICT_CALLBACK_HMAC_SECRET = "unit-test-secret";
  });

  afterEach(() => {
    delete process.env.VERDICT_CALLBACK_HMAC_SECRET;
  });

  it("signVerdictPayload returns stable hex HMAC for same payload", () => {
    const payload = { reviewId: "abc", verdict: "suspicious" };
    const a = signVerdictPayload(payload);
    const b = signVerdictPayload(payload);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});
