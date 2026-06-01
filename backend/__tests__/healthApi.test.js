jest.mock("../src/lib/healthChecks", () => ({
  livenessPayload: jest.fn(() => ({
    status: "ok",
    probe: "live",
    service: "triage-api",
  })),
  readinessPayload: jest.fn(async () => ({
    status: "ok",
    probe: "ready",
    checks: [{ name: "mongodb", ok: true }],
  })),
}));

const request = require("supertest");
const express = require("express");
const healthRoutes = require("../src/api/health");
const { livenessPayload, readinessPayload } = require("../src/lib/healthChecks");

/** Minimal Express app mounting health routes (mirrors createApp public mount). */
function buildApp() {
  const app = express();
  app.use("/health", healthRoutes);
  return app;
}

describe("health API routes", () => {
  const app = buildApp();

  it("GET /health/live returns 200 liveness payload", async () => {
    const res = await request(app).get("/health/live");
    expect(res.status).toBe(200);
    expect(res.body.probe).toBe("live");
    expect(livenessPayload).toHaveBeenCalled();
  });

  it("GET /health/ready returns 200 when dependencies ok", async () => {
    readinessPayload.mockResolvedValueOnce({
      status: "ok",
      checks: [{ name: "postgres", ok: true }],
    });
    const res = await request(app).get("/health/ready");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("GET /health/ready returns 503 when degraded", async () => {
    readinessPayload.mockResolvedValueOnce({
      status: "degraded",
      checks: [{ name: "mongodb", ok: false }],
    });
    const res = await request(app).get("/health/ready");
    expect(res.status).toBe(503);
    expect(res.body.status).toBe("degraded");
  });

  it("GET /health summary mirrors readiness", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.service).toBe("triage-api");
    expect(res.body.checks).toBeDefined();
  });
});
