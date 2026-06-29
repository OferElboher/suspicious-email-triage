/**
 * Operations routes: Prometheus scrape, alert evaluation, log summary (TBD 1.3–1.4 free path).
 */
const express = require("express");
const { renderPrometheusText } = require("../lib/appMetrics");
const { evaluateAlerts } = require("../lib/alertEvaluator");
const { summarizeLogs } = require("../lib/logSummary");
const { authenticate, requirePermission } = require("../http/middleware/auth");
const logger = require("../lib/logger");
const {
  backupProviderStatus,
  listBackupObjects,
  backupProviderMode,
} = require("../backups/s3BackupProvider");
const { runPostgresBackupToS3 } = require("../backups/backupService");

const router = express.Router();

/** GET /ops/prometheus — Prometheus text exposition (no auth — standard scrape pattern). */
router.get("/prometheus", (_req, res) => {
  res.set("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  res.send(renderPrometheusText());
});

/** GET /ops/alerts — JSON alerts from readiness + in-process counters (requires metrics.read). */
router.get("/alerts", authenticate, requirePermission("metrics.read"), async (_req, res) => {
  try {
    const result = await evaluateAlerts();
    res.json(result);
  } catch (err) {
    logger.error("ops", "alerts failed", { error: err.message });
    res.status(500).json({ error: "alerts_failed" });
  }
});

/** GET /ops/logs/summary — topic/level counts from merged.log (requires logs.read). */
router.get("/logs/summary", authenticate, requirePermission("logs.read"), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "5000", 10), 50000);
    const summary = await summarizeLogs({ limit });
    res.json(summary);
  } catch (err) {
    logger.error("ops", "log summary failed", { error: err.message });
    res.status(500).json({ error: "log_summary_failed" });
  }
});

/** GET /ops/backups/status — S3 backup provider metadata (requires ops.backups). */
router.get("/backups/status", authenticate, requirePermission("ops.backups"), async (_req, res) => {
  res.json(backupProviderStatus());
});

/** GET /ops/backups — list recent S3 backup objects (requires ops.backups). */
router.get("/backups", authenticate, requirePermission("ops.backups"), async (req, res) => {
  try {
    if (backupProviderMode() === "disabled") {
      res.status(503).json({ error: "backups_disabled" });
      return;
    }
    const prefix = String(req.query.prefix || "postgres/");
    const listed = await listBackupObjects({ prefix });
    res.json(listed);
  } catch (err) {
    logger.error("ops", "backup list failed", { error: err.message });
    res.status(500).json({ error: "backup_list_failed" });
  }
});

/** POST /ops/backups/run — upload logical PostgreSQL snapshot to S3 (requires ops.backups). */
router.post("/backups/run", authenticate, requirePermission("ops.backups"), async (_req, res) => {
  try {
    if (backupProviderMode() === "disabled") {
      res.status(503).json({ error: "backups_disabled" });
      return;
    }
    const result = await runPostgresBackupToS3();
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error("ops", "backup run failed", { error: err.message });
    res.status(500).json({ error: "backup_run_failed", message: err.message });
  }
});

module.exports = router;
