jest.mock("../src/stats/statsPg", () => ({
  getTimeseries: jest.fn(async ({ eventType }) => [
    { t: "2026-01-01T12:00:00.000Z", count: eventType === "status_changed" ? 5 : 3 },
  ]),
  getStatusBreakdown: jest.fn(async () => [{ status: "completed", count: 2 }]),
}));

jest.mock("../src/metrics/flowMetrics", () => ({
  getFlowDashboardSnapshot: jest.fn(async () => ({
    generatedAt: "2026-06-01T12:00:00.000Z",
    queue: { pending: 1, total: 5 },
    gauges: { ingestRatePercent: 20 },
  })),
}));

jest.mock("../src/metrics/agentTriageMetrics", () => ({
  getAgentTriageSnapshot: jest.fn(async () => ({
    agentEnabled: false,
    cloudProvider: "mock",
    safetyLimits: { maxToolSteps: 3, maxWallMs: 30000, maxBodyChars: 8000 },
    summary: { reviewsWithTrace: 0, recentSampleSize: 0 },
    recentRuns: [],
  })),
}));

jest.mock("../src/http/middleware/auth", () => ({
  requirePermission: () => (_req, _res, next) => next(),
}));

const request = require("supertest");
const express = require("express");
const metricsRoutes = require("../src/api/metrics");
const { getTimeseries } = require("../src/stats/statsPg");
const { getFlowDashboardSnapshot } = require("../src/metrics/flowMetrics");
const { getAgentTriageSnapshot } = require("../src/metrics/agentTriageMetrics");

function buildApp() {
  const app = express();
  app.use("/metrics", metricsRoutes);
  return app;
}

describe("metrics API", () => {
  it("GET /metrics/timeseries defaults to review_created (ingests)", async () => {
    const app = buildApp();
    const res = await request(app).get("/metrics/timeseries");
    expect(res.status).toBe(200);
    expect(res.body.measure).toBe("ingests");
    expect(res.body.eventType).toBe("review_created");
    expect(getTimeseries).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "review_created" })
    );
  });

  it("GET /metrics/timeseries measure=status_events uses status_changed", async () => {
    const app = buildApp();
    const res = await request(app).get("/metrics/timeseries?measure=status_events");
    expect(res.status).toBe(200);
    expect(res.body.eventType).toBe("status_changed");
    expect(getTimeseries).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "status_changed" })
    );
  });

  it("GET /metrics/flow-dashboard returns live snapshot", async () => {
    const app = buildApp();
    const res = await request(app).get("/metrics/flow-dashboard");
    expect(res.status).toBe(200);
    expect(getFlowDashboardSnapshot).toHaveBeenCalled();
    expect(res.body.queue.pending).toBe(1);
  });

  it("GET /metrics/agent-triage returns agent activity snapshot", async () => {
    const app = buildApp();
    const res = await request(app).get("/metrics/agent-triage");
    expect(res.status).toBe(200);
    expect(getAgentTriageSnapshot).toHaveBeenCalled();
    expect(res.body.cloudProvider).toBe("mock");
  });
});
