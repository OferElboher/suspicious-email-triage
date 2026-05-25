/**
 * Metrics routes: chart data backed by PostgreSQL statistics events.
 * MongoDB is intentionally not scanned here, so large review history stays cheap to browse.
 */
const express = require("express");
const logger = require("../lib/logger");
const { getTimeseries, getStatusBreakdown } = require("../stats/statsPg");
const { requirePermission } = require("../http/middleware/auth");

/** router: Express metrics route collection mounted at /metrics. */
const router = express.Router();

/**
 * GET /metrics/timeseries
 * Returns [{ t: ISO, count }, ...] from PostgreSQL review_created events.
 */
router.get("/timeseries", requirePermission("metrics.read"), async (req, res) => {
  try {
    /** now: default upper bound for chart windows when `to` is omitted. */
    const now = Date.now();
    /** from: start of the requested chart window; defaults to seven days ago. */
    const from = new Date(
      req.query.from || now - 7 * 24 * 60 * 60 * 1000
    );
    /** to: end of the requested chart window; defaults to the current time. */
    const to = new Date(req.query.to || now);
    /** bucketKey: requested chart bucket width (15m, 1h, or 1d). */
    const bucketKey = (req.query.bucket || "1h").toLowerCase();
    /** series: compact PostgreSQL aggregate used directly by the frontend chart. */
    const series = await getTimeseries({ from, to, bucket: bucketKey });
    res.json({
      from: from.toISOString(),
      to: to.toISOString(),
      bucket: bucketKey,
      series,
    });
  } catch (err) {
    logger.error("metrics", "timeseries failed", { error: err.message });
    res.status(500).json({ error: "metrics_failed" });
  }
});

/**
 * GET /metrics/status-breakdown
 * Counts status_changed events in PostgreSQL for the selected window.
 */
router.get("/status-breakdown", requirePermission("metrics.read"), async (req, res) => {
  try {
    /** now: default upper bound for status chart windows. */
    const now = Date.now();
    /** from: start of status event window. */
    const from = new Date(
      req.query.from || now - 7 * 24 * 60 * 60 * 1000
    );
    /** to: end of status event window. */
    const to = new Date(req.query.to || now);
    /** breakdown: compact counts from PostgreSQL statistics events. */
    const breakdown = await getStatusBreakdown({ from, to });
    res.json({
      from: from.toISOString(),
      to: to.toISOString(),
      breakdown,
    });
  } catch (err) {
    logger.error("metrics", "breakdown failed", { error: err.message });
    res.status(500).json({ error: "metrics_failed" });
  }
});

module.exports = router;
