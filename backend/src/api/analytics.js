/**
 * REST routes for Snowflake analytical warehouse queries and export status.
 *
 * Pattern: read-only analytics via metrics.read; mutating dev export via dev.reset.
 * Technology: Express router + snowflakeClient HTTP to mock-aws-snowflake service.
 */
const express = require("express");
const {
  isSnowflakeEnabled,
  getWarehouseStatus,
  clearAnalyticsTables,
  snowflakeRequest,
} = require("../analytics/snowflakeClient");
const {
  syncReviewSnowflakeById,
  exportAllCompletedReviews,
} = require("../analytics/snowflakeExport");
const { authenticate, requirePermission } = require("../http/middleware/auth");
const logger = require("../lib/logger");

const router = express.Router();

/** GET /analytics/snowflake/status — warehouse connectivity and row counts. */
router.get(
  "/snowflake/status",
  authenticate,
  requirePermission("metrics.read"),
  async (_req, res) => {
    try {
      const status = await getWarehouseStatus();
      res.json({
        enabled: isSnowflakeEnabled(),
        ...status,
      });
    } catch (err) {
      logger.error("analytics", "snowflake status failed", { error: err.message });
      res.status(500).json({ error: "snowflake_status_failed" });
    }
  }
);

/** GET /analytics/verdict-distribution?from=&to= — verdict counts for reporting. */
router.get(
  "/verdict-distribution",
  authenticate,
  requirePermission("metrics.read"),
  async (req, res) => {
    try {
      const qs = new URLSearchParams();
      if (req.query.from) qs.set("from", req.query.from);
      if (req.query.to) qs.set("to", req.query.to);
      const result = await snowflakeRequest(`/v1/analytics/verdict-distribution?${qs}`);
      res.json(result);
    } catch (err) {
      logger.error("analytics", "verdict distribution failed", { error: err.message });
      res.status(500).json({ error: "analytics_query_failed" });
    }
  }
);

/** GET /analytics/override-rate?from=&to= — analyst override rate metrics. */
router.get(
  "/override-rate",
  authenticate,
  requirePermission("metrics.read"),
  async (req, res) => {
    try {
      const qs = new URLSearchParams();
      if (req.query.from) qs.set("from", req.query.from);
      if (req.query.to) qs.set("to", req.query.to);
      const result = await snowflakeRequest(`/v1/analytics/override-rate?${qs}`);
      res.json(result);
    } catch (err) {
      logger.error("analytics", "override rate failed", { error: err.message });
      res.status(500).json({ error: "analytics_query_failed" });
    }
  }
);

/** GET /analytics/processing-stats?from=&to= — avg/p95 processing duration. */
router.get(
  "/processing-stats",
  authenticate,
  requirePermission("metrics.read"),
  async (req, res) => {
    try {
      const qs = new URLSearchParams();
      if (req.query.from) qs.set("from", req.query.from);
      if (req.query.to) qs.set("to", req.query.to);
      const result = await snowflakeRequest(`/v1/analytics/processing-stats?${qs}`);
      res.json(result);
    } catch (err) {
      logger.error("analytics", "processing stats failed", { error: err.message });
      res.status(500).json({ error: "analytics_query_failed" });
    }
  }
);

/** GET /analytics/phishing-trends?from=&to= — daily risky verdict counts. */
router.get(
  "/phishing-trends",
  authenticate,
  requirePermission("metrics.read"),
  async (req, res) => {
    try {
      const qs = new URLSearchParams();
      if (req.query.from) qs.set("from", req.query.from);
      if (req.query.to) qs.set("to", req.query.to);
      const result = await snowflakeRequest(`/v1/analytics/phishing-trends?${qs}`);
      res.json(result);
    } catch (err) {
      logger.error("analytics", "phishing trends failed", { error: err.message });
      res.status(500).json({ error: "analytics_query_failed" });
    }
  }
);

/** GET /analytics/model-performance?from=&to= — override rate + avg confidence proxy. */
router.get(
  "/model-performance",
  authenticate,
  requirePermission("metrics.read"),
  async (req, res) => {
    try {
      const qs = new URLSearchParams();
      if (req.query.from) qs.set("from", req.query.from);
      if (req.query.to) qs.set("to", req.query.to);
      const result = await snowflakeRequest(`/v1/analytics/model-performance?${qs}`);
      res.json(result);
    } catch (err) {
      logger.error("analytics", "model performance failed", { error: err.message });
      res.status(500).json({ error: "analytics_query_failed" });
    }
  }
);

/** POST /analytics/snowflake/export/:id — manual export of one review (metrics.read). */
router.post(
  "/snowflake/export/:id",
  authenticate,
  requirePermission("metrics.read"),
  async (req, res) => {
    try {
      const result = await syncReviewSnowflakeById(req.params.id);
      res.json(result);
    } catch (err) {
      logger.error("analytics", "manual export failed", { error: err.message });
      res.status(500).json({ error: "snowflake_export_failed" });
    }
  }
);

/** POST /analytics/snowflake/export-batch — backfill completed reviews (developer). */
router.post(
  "/snowflake/export-batch",
  authenticate,
  requirePermission("dev.reset"),
  async (req, res) => {
    if (!req.auth.roles.includes("developer") && !req.auth.roles.includes("admin")) {
      return res.status(403).json({ error: "admin_or_developer_required" });
    }
    try {
      const result = await exportAllCompletedReviews(req.body?.limit);
      res.json({ ok: true, ...result });
    } catch (err) {
      logger.error("analytics", "batch export failed", { error: err.message });
      res.status(500).json({ error: "snowflake_batch_export_failed" });
    }
  }
);

/** DELETE /analytics/snowflake/data — clear mock warehouse tables (dev only). */
router.delete(
  "/snowflake/data",
  authenticate,
  requirePermission("dev.reset"),
  async (req, res) => {
    if (!req.auth.roles.includes("developer") && !req.auth.roles.includes("admin")) {
      return res.status(403).json({ error: "admin_or_developer_required" });
    }
    try {
      const result = await clearAnalyticsTables();
      res.json(result);
    } catch (err) {
      logger.error("analytics", "clear warehouse failed", { error: err.message });
      res.status(500).json({ error: "snowflake_clear_failed" });
    }
  }
);

module.exports = router;
