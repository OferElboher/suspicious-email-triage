/**
 * Unit tests for Postgres ingest_clients registry (mocked pg pool).
 */
jest.mock("../src/ingest/ingestClientsPg", () => {
  const store = new Map([
    [
      "dev-mock",
      {
        client_id: "dev-mock",
        display_name: "Dev mock",
        callback_url: "http://mock.test/webhook",
        is_active: true,
      },
    ],
  ]);
  return {
    getIngestClient: jest.fn(async (clientId) => store.get(clientId) || null),
    listIngestClients: jest.fn(async () => Array.from(store.values())),
    upsertIngestClient: jest.fn(),
    ensureIngestClientsSchema: jest.fn(),
  };
});

jest.mock("../src/kafka/reviewCompletedProducer", () => ({
  publishReviewCompleted: jest.fn().mockResolvedValue(undefined),
}));

const Review = require("../src/models/Review");
const { getIngestClient } = require("../src/ingest/ingestClientsPg");
const {
  resolveCallbackUrl,
  deliverVerdictForReview,
} = require("../src/services/verdictDelivery");

describe("verdictDelivery ingestClientId", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    delete process.env.VERDICT_CALLBACK_URL;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("resolveCallbackUrl uses Postgres client registry before env fallback", async () => {
    const url = await resolveCallbackUrl({
      ingestClientId: "dev-mock",
      callbackUrl: "",
    });
    expect(url).toBe("http://mock.test/webhook");
    expect(getIngestClient).toHaveBeenCalledWith("dev-mock");
  });

  it("resolveCallbackUrl prefers per-message callbackUrl over client registry", async () => {
    const url = await resolveCallbackUrl({
      ingestClientId: "dev-mock",
      callbackUrl: "http://override.test/hook",
    });
    expect(url).toBe("http://override.test/hook");
  });

  it("deliverVerdictForReview POSTs using ingestClientId default URL", async () => {
    Review.findById = jest.fn().mockResolvedValue({
      _id: { toString: () => "507f1f77bcf86cd799439011" },
      toObject: () => ({
        _id: "507f1f77bcf86cd799439011",
        status: "completed",
        ingestClientId: "dev-mock",
        analysisResult: { verdict: "suspicious", recommendedAction: "investigate" },
      }),
      ingestClientId: "dev-mock",
      status: "completed",
      analysisResult: { verdict: "suspicious", recommendedAction: "investigate" },
    });
    Review.updateOne = jest.fn().mockResolvedValue({});

    const result = await deliverVerdictForReview("507f1f77bcf86cd799439011", "analysis_complete");
    expect(result.delivered).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://mock.test/webhook",
      expect.objectContaining({ method: "POST" })
    );
  });
});
