/**
 * Pipeline orchestration routes — Prefect health flow + dbt daily rollup for the analytics UI.
 *
 * Pattern: thin Express layer over Python Prefect bridge and PostgreSQL dbt VIEW reader.
 * Permission: metrics.read (same audience as chart metrics).
 */
const express = require("express");
const logger = require("../lib/logger");
const { requirePermission } = require("../http/middleware/auth");
const { runPrefectHealthCheck } = require("../pipeline/prefectRunner");
const { getDbtDailyRollup } = require("../pipeline/dbtDaily");

/** router: /pipeline/* orchestration data for React PipelineOrchestrationPanel. */
const router = express.Router();

/**
 * GET /pipeline/prefect-health?hours=24
 * Runs review-stats-health-check flow (Prefect when Python available).
 */
router.get("/prefect-health", requirePermission("metrics.read"), async (req, res) => {
  try {
    const hours = parseInt(req.query.hours || "24", 10);
    const result = await runPrefectHealthCheck(hours);
    res.json(result);
  } catch (err) {
    logger.error("pipeline", "prefect-health failed", { error: err.message });
    res.status(500).json({ error: "prefect_health_failed" });
  }
});

/**
 * GET /pipeline/dbt-daily?limit=14
 * Returns rows from dbt model review_stats_daily (VIEW in Postgres).
 */
router.get("/dbt-daily", requirePermission("metrics.read"), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || "14", 10);
    const result = await getDbtDailyRollup({ limit });
    res.json(result);
  } catch (err) {
    logger.error("pipeline", "dbt-daily failed", { error: err.message });
    res.status(500).json({ error: "dbt_daily_failed" });
  }
});

module.exports = router;
