jest.mock("../src/analytics/snowflakeClient", () => ({
  isSnowflakeEnabled: jest.fn(() => true),
  insertRows: jest.fn(async () => ({ ok: true, inserted: 1 })),
  getWarehouseStatus: jest.fn(async () => ({ ok: true, rowCounts: {} })),
  clearAnalyticsTables: jest.fn(async () => ({ ok: true })),
  snowflakeRequest: jest.fn(async () => ({ ok: true })),
  resetSnowflakeClient: jest.fn(),
}));

const { insertRows } = require("../src/analytics/snowflakeClient");
const {
  reviewToAnalyticsRow,
  buildExportPayload,
  processingDurationMs,
} = require("../src/analytics/reviewToSnowflakeRow");
const {
  isExportableReview,
  exportReviewToSnowflake,
} = require("../src/analytics/snowflakeExport");

describe("reviewToSnowflakeRow", () => {
  it("maps completed review to analytical row with effective verdict", () => {
    const row = reviewToAnalyticsRow({
      _id: "abc123",
      senderEmail: "A@test.com",
      subject: "Verify",
      status: "completed",
      createdAt: new Date("2026-06-01T10:00:00Z"),
      updatedAt: new Date("2026-06-01T10:00:05Z"),
      analysisResult: {
        verdict: "likely_phishing",
        recommendedAction: "report_and_block",
        summary: "phish",
        findings: [{ severity: "high", explanation: "bad url" }],
      },
      override: { verdict: "suspicious", analystEmail: "analyst@test.com" },
    });
    expect(row.review_id).toBe("abc123");
    expect(row.effective_verdict).toBe("suspicious");
    expect(row.automated_verdict).toBe("likely_phishing");
    expect(row.has_override).toBe(true);
    expect(row.findings_high).toBe(1);
  });

  it("buildExportPayload includes override event table when override present", () => {
    const payload = buildExportPayload({
      _id: "x",
      status: "completed",
      analysisResult: { verdict: "benign", findings: [] },
      override: { verdict: "likely_phishing", analystEmail: "a@test.com" },
    });
    expect(payload.OVERRIDE_EVENTS).toHaveLength(1);
    expect(payload.REVIEWS_ANALYTICS).toHaveLength(1);
  });

  it("processingDurationMs computes positive delta", () => {
    const ms = processingDurationMs({
      createdAt: new Date("2026-06-01T10:00:00Z"),
      updatedAt: new Date("2026-06-01T10:00:02.500Z"),
    });
    expect(ms).toBe(2500);
  });
});

describe("snowflakeExport", () => {
  beforeEach(() => {
    insertRows.mockClear();
  });

  it("isExportableReview requires completed status and verdict", () => {
    expect(isExportableReview({ status: "pending" })).toBe(false);
    expect(
      isExportableReview({
        status: "completed",
        analysisResult: { verdict: "benign" },
      })
    ).toBe(true);
  });

  it("exportReviewToSnowflake inserts into analytical tables", async () => {
    const result = await exportReviewToSnowflake({
      _id: "rev1",
      senderEmail: "s@test.com",
      subject: "Hi",
      status: "completed",
      analysisResult: { verdict: "likely_phishing", findings: [] },
    });
    expect(result.exported).toBe(true);
    expect(insertRows).toHaveBeenCalled();
  });
});
