jest.mock("../src/pipeline/prefectRunner", () => ({
  runPrefectHealthCheck: jest.fn(async () => ({
    hours: 24,
    eventCount: 42,
    windowStart: "2026-01-01T00:00:00.000Z",
    source: "prefect-flow",
    flowName: "review-stats-health-check",
    healthy: true,
    status: "ok",
  })),
}));

jest.mock("../src/pipeline/dbtDaily", () => ({
  getDbtDailyRollup: jest.fn(async () => ({
    model: "review_stats_daily",
    project: "triage_dbt_demo",
    materialization: "view",
    rows: [{ stats_day: "2026-01-01T00:00:00.000Z", event_count: 10, label: "1/1/2026" }],
  })),
}));

jest.mock("../src/http/middleware/auth", () => ({
  requirePermission: () => (_req, _res, next) => next(),
}));

const request = require("supertest");
const express = require("express");
const pipelineRoutes = require("../src/api/pipeline");
const { runPrefectHealthCheck } = require("../src/pipeline/prefectRunner");
const { getDbtDailyRollup } = require("../src/pipeline/dbtDaily");

/** Mount pipeline router for supertest. */
function buildApp() {
  const app = express();
  app.use("/pipeline", pipelineRoutes);
  return app;
}

describe("pipeline API routes", () => {
  it("GET /pipeline/prefect-health returns Prefect flow result", async () => {
    const app = buildApp();
    const res = await request(app).get("/pipeline/prefect-health?hours=24");
    expect(res.status).toBe(200);
    expect(runPrefectHealthCheck).toHaveBeenCalledWith(24);
    expect(res.body.flowName).toBe("review-stats-health-check");
    expect(res.body.eventCount).toBe(42);
  });

  it("GET /pipeline/dbt-daily returns dbt model rows", async () => {
    const app = buildApp();
    const res = await request(app).get("/pipeline/dbt-daily?limit=14");
    expect(res.status).toBe(200);
    expect(getDbtDailyRollup).toHaveBeenCalledWith({ limit: 14 });
    expect(res.body.model).toBe("review_stats_daily");
    expect(res.body.rows.length).toBe(1);
  });
});
