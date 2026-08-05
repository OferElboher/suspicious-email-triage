/**
 * Unit tests for outbound verdict webhook delivery service.
 */
jest.mock("../src/ingest/ingestClientsPg", () => ({
  getIngestClient: jest.fn().mockResolvedValue(null),
  listIngestClients: jest.fn().mockResolvedValue([]),
  upsertIngestClient: jest.fn(),
  ensureIngestClientsSchema: jest.fn(),
}));

jest.mock("../src/kafka/reviewCompletedProducer", () => ({
  publishReviewCompleted: jest.fn().mockResolvedValue(undefined),
}));

const Review = require("../src/models/Review");
const {
  buildVerdictPayload,
  deliverVerdictForReview,
  resolveCallbackUrl,
} = require("../src/services/verdictDelivery");
const { publishReviewCompleted } = require("../src/kafka/reviewCompletedProducer");

describe("verdictDelivery", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.VERDICT_CALLBACK_HMAC_SECRET = "test-hmac-secret";
    process.env.VERDICT_CALLBACK_URL = "http://mock-callback.test/webhook";
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.VERDICT_CALLBACK_HMAC_SECRET;
    delete process.env.VERDICT_CALLBACK_URL;
  });

  it("buildVerdictPayload includes externalMessageId and effective verdict", () => {
    const payload = buildVerdictPayload(
      {
        _id: "507f1f77bcf86cd799439011",
        status: "completed",
        source: "mailbox_ingest",
        externalMessageId: "msg-123",
        analysisResult: { verdict: "suspicious", recommendedAction: "investigate" },
      },
      "analysis_complete"
    );
    expect(payload.externalMessageId).toBe("msg-123");
    expect(payload.verdict).toBe("suspicious");
    expect(payload.reason).toBe("analysis_complete");
  });

  it("resolveCallbackUrl prefers per-message callbackUrl over env default", async () => {
    const url = await resolveCallbackUrl({
      callbackUrl: "http://custom.test/hook",
    });
    expect(url).toBe("http://custom.test/hook");
  });

  it("resolveCallbackUrl falls back to VERDICT_CALLBACK_URL env", async () => {
    const url = await resolveCallbackUrl({});
    expect(url).toBe("http://mock-callback.test/webhook");
  });

  it("deliverVerdictForReview POSTs webhook and marks delivered", async () => {
    Review.findById = jest.fn().mockResolvedValue({
      _id: { toString: () => "507f1f77bcf86cd799439011" },
      toObject: () => ({
        _id: "507f1f77bcf86cd799439011",
        status: "completed",
        source: "mailbox_simulation",
        externalMessageId: "ext-1",
        analysisResult: { verdict: "likely_phishing", recommendedAction: "report_and_block" },
      }),
      externalMessageId: "ext-1",
      status: "completed",
      source: "mailbox_simulation",
      analysisResult: { verdict: "likely_phishing", recommendedAction: "report_and_block" },
    });
    Review.updateOne = jest.fn().mockResolvedValue({});
    global.fetch.mockResolvedValue({ ok: true, status: 200 });

    const result = await deliverVerdictForReview("507f1f77bcf86cd799439011", "analysis_complete");
    expect(result.delivered).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://mock-callback.test/webhook",
      expect.objectContaining({ method: "POST" })
    );
    expect(publishReviewCompleted).toHaveBeenCalled();
  });

  it("skips delivery when no callback URL configured", async () => {
    delete process.env.VERDICT_CALLBACK_URL;
    Review.findById = jest.fn().mockResolvedValue({
      _id: { toString: () => "abc" },
      callbackUrl: "",
      status: "completed",
      analysisResult: { verdict: "benign" },
    });
    Review.updateOne = jest.fn().mockResolvedValue({});

    const result = await deliverVerdictForReview("abc", "analysis_complete");
    expect(result.skipped).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
