/**
 * Health probe routes for Docker HEALTHCHECK and Kubernetes liveness/readiness.
 * Mounted at /health before JWT auth so load balancers can poll without tokens.
 */
const express = require("express");
const { livenessPayload, readinessPayload } = require("../lib/healthChecks");

const router = express.Router();

/** GET /health/live — process alive (no dependency checks). */
router.get("/live", (_req, res) => {
  res.json(livenessPayload());
});

/** GET /health/ready — dependency checks (Mongo, Postgres, Redis, Neo4j). */
router.get("/ready", async (_req, res) => {
  try {
    const body = await readinessPayload();
    const code = body.status === "ok" ? 200 : 503;
    res.status(code).json(body);
  } catch (err) {
    res.status(503).json({
      status: "error",
      probe: "ready",
      error: err.message,
    });
  }
});

/** GET /health — backward-compatible summary (same shape as legacy clients). */
router.get("/", async (_req, res) => {
  try {
    const ready = await readinessPayload();
    res.status(ready.status === "ok" ? 200 : 503).json({
      status: ready.status,
      service: "triage-api",
      auth: "required_for_api",
      checks: ready.checks,
    });
  } catch (err) {
    res.status(503).json({ status: "error", service: "triage-api", error: err.message });
  }
});

module.exports = router;
