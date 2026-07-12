jest.mock("../src/models/Review", () => ({
  countDocuments: jest.fn(),
  find: jest.fn(),
}));

const Review = require("../src/models/Review");
const {
  getAgentTriageSnapshot,
  summarizeAgentRun,
  RECENT_RUNS_LIMIT,
} = require("../src/metrics/agentTriageMetrics");

describe("agentTriageMetrics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AGENT_TRIAGE_ENABLED = "false";
    process.env.LLM_CLOUD_PROVIDER = "mock";
    process.env.AGENT_MAX_TOOL_STEPS = "3";
    process.env.AGENT_MAX_WALL_MS = "30000";
    process.env.AGENT_MAX_BODY_CHARS = "8000";
  });

  it("summarizeAgentRun redacts trace without email body", () => {
    const row = summarizeAgentRun({
      _id: "507f1f77bcf86cd799439011",
      subject: "Test",
      senderEmail: "a@b.com",
      status: "completed",
      updatedAt: "2026-06-01T12:00:00.000Z",
      analysisResult: { verdict: "likely_phishing" },
      agentTrace: {
        runId: "run-1",
        provider: "mock",
        modelId: "mock",
        statesVisited: ["INTAKE", "PLAN", "FALLBACK_RULES"],
        toolCalls: [{ name: "run_rule_engine", ok: true, latencyMs: 2 }],
        guardrailEvents: [{ stage: "pre", rule: "pii_mask", action: "redacted" }],
        wallDurationMs: 120,
        plan: { intent: "investigate" },
      },
    });
    expect(row.reviewId).toBe("507f1f77bcf86cd799439011");
    expect(row.fallback).toBe(true);
    expect(row.guardrailEventCount).toBe(1);
    expect(row.planIntent).toBe("investigate");
    expect(row.body).toBeUndefined();
  });

  it("getAgentTriageSnapshot returns capped recent runs and safety metadata", async () => {
    Review.countDocuments.mockResolvedValue(42);
    const leanChain = {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        {
          _id: "id1",
          subject: "Phish",
          senderEmail: "x@y.com",
          status: "completed",
          updatedAt: "2026-06-01T12:00:00.000Z",
          analysisResult: { verdict: "suspicious" },
          agentTrace: {
            runId: "r1",
            provider: "mock",
            modelId: "mock",
            statesVisited: ["INTAKE", "PLAN", "PERSIST"],
            toolCalls: [{ name: "run_rule_engine", ok: true }],
            wallDurationMs: 200,
          },
        },
      ]),
    };
    Review.find.mockReturnValue(leanChain);

    const snap = await getAgentTriageSnapshot();

    expect(Review.find).toHaveBeenCalledWith({ agentTrace: { $exists: true, $ne: null } });
    expect(leanChain.limit).toHaveBeenCalledWith(RECENT_RUNS_LIMIT);
    expect(snap.agentEnabled).toBe(false);
    expect(snap.cloudProvider).toBe("mock");
    expect(snap.safetyLimits.maxToolSteps).toBe(3);
    expect(snap.summary.reviewsWithTrace).toBe(42);
    expect(snap.summary.recentSampleSize).toBe(1);
    expect(snap.summary.toolCallTotals.run_rule_engine).toBe(1);
    expect(snap.recentRuns[0].verdict).toBe("suspicious");
  });
});
