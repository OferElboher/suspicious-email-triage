jest.mock("../src/http/middleware/auth", () => ({
  authenticate: (req, _res, next) => {
    req.auth = {
      email: "dev@test.local",
      roles: ["developer", "admin"],
      permissions: ["metrics.read", "dev.reset"],
    };
    next();
  },
  requirePermission:
    (...required) =>
    (req, res, next) => {
      const granted = new Set(req.auth?.permissions || []);
      if (!required.some((p) => granted.has(p))) {
        return res.status(403).json({ error: "forbidden" });
      }
      return next();
    },
}));

jest.mock("../src/analytics/snowflakeClient", () => ({
  isSnowflakeEnabled: jest.fn(() => true),
  getWarehouseStatus: jest.fn(async () => ({
    ok: true,
    account: "mock_account",
    rowCounts: { REVIEWS_ANALYTICS: 3 },
  })),
  snowflakeRequest: jest.fn(async (path) => ({
    ok: true,
    path,
    distribution: [{ verdict: "likely_phishing", count: 2 }],
  })),
  clearAnalyticsTables: jest.fn(async () => ({ ok: true, cleared: true })),
}));

jest.mock("../src/analytics/snowflakeExport", () => ({
  syncReviewSnowflakeById: jest.fn(async () => ({ exported: true })),
  exportAllCompletedReviews: jest.fn(async () => ({ exported: 2, skipped: 0, scanned: 2 })),
}));

const request = require("supertest");
const express = require("express");
const analyticsRoutes = require("../src/api/analytics");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/analytics", analyticsRoutes);
  return app;
}

describe("analytics API routes", () => {
  const app = buildApp();
  const bearer = { Authorization: "Bearer test" };

  it("GET /analytics/snowflake/status returns warehouse info", async () => {
    const res = await request(app).get("/analytics/snowflake/status").set(bearer);
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.rowCounts.REVIEWS_ANALYTICS).toBe(3);
  });

  it("GET /analytics/verdict-distribution returns distribution", async () => {
    const res = await request(app)
      .get("/analytics/verdict-distribution?from=2026-06-01")
      .set(bearer);
    expect(res.status).toBe(200);
    expect(res.body.distribution).toBeDefined();
  });
});
