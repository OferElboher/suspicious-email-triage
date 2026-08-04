/**
 * Metrics routes: chart data backed by PostgreSQL statistics events.
 * MongoDB is intentionally not scanned here, so large review history stays cheap to browse.
 */
const express = require("express");
const logger = require("../lib/logger");
const { getTimeseries, getStatusBreakdown } = require("../stats/statsPg");
const { getFlowDashboardSnapshot } = require("../metrics/flowMetrics");
const { getAgentTriageSnapshot } = require("../metrics/agentTriageMetrics");
const {
  getMailboxIngestDashboard,
  postMailboxSimulation,
  getMailboxSimulationStatus,
  isMailboxIngestEnabled,
} = require("../lib/ingestGatewayClient");
const {
  getMockVerdictCallbackStats,
  getMockVerdictCallbacks,
} = require("../lib/mockVerdictCallbackClient");
const { getVerdictDeliveryMetrics } = require("../services/verdictDelivery");
const { listPhishingSimulationTemplates } = require("../lib/phishingSimulationTemplates");
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
    /** measure: which PostgreSQL event_type to aggregate (ingests vs status_events). */
    const measure = String(req.query.measure || "ingests").toLowerCase();
    const eventType =
      measure === "status_events" || measure === "status" ? "status_changed" : "review_created";
    /** series: compact PostgreSQL aggregate used directly by the frontend chart. */
    const series = await getTimeseries({ from, to, bucket: bucketKey, eventType });
    res.json({
      from: from.toISOString(),
      to: to.toISOString(),
      bucket: bucketKey,
      measure,
      eventType,
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

/**
 * GET /metrics/flow-dashboard — live queue depths, rates, arrival volatility σ, pipeline counters for gauge UI.
 * Pattern: polled on configurable interval by FlowDashboardView (Mongo counts + appMetrics + Redis sim).
 */
router.get("/flow-dashboard", requirePermission("metrics.read"), async (_req, res) => {
  try {
    const snapshot = await getFlowDashboardSnapshot();
    res.json(snapshot);
  } catch (err) {
    logger.error("metrics", "flow-dashboard failed", { error: err.message });
    res.status(500).json({ error: "flow_dashboard_failed" });
  }
});

/**
 * GET /metrics/agent-triage — recent agent FSM runs + safety limit metadata for Agent Activity UI.
 * Pattern: capped Mongo query (25 docs); no email bodies — safe for all deployment tiers.
 */
router.get("/agent-triage", requirePermission("metrics.read"), async (_req, res) => {
  try {
    const snapshot = await getAgentTriageSnapshot();
    res.json(snapshot);
  } catch (err) {
    logger.error("metrics", "agent-triage failed", { error: err.message });
    res.status(500).json({ error: "agent_triage_metrics_failed" });
  }
});

/**
 * GET /metrics/mailbox-ingest — proxy Go ingest-gateway dashboard JSON for the React ingest tab.
 * Pattern: JWT-protected Node proxy so the browser never calls the Go container directly.
 */
router.get("/mailbox-ingest", requirePermission("metrics.read"), async (_req, res) => {
  try {
    const snapshot = await getMailboxIngestDashboard();
    res.json(snapshot);
  } catch (err) {
    logger.error("metrics", "mailbox-ingest failed", { error: err.message });
    res.status(500).json({ error: "mailbox_ingest_metrics_failed" });
  }
});

/**
 * GET /metrics/mailbox-ingest/simulation — dev simulation status from Go gateway.
 */
router.get("/mailbox-ingest/simulation", requirePermission("metrics.read"), async (_req, res) => {
  try {
    if (!isMailboxIngestEnabled()) {
      return res.json({ available: false, enabled: false });
    }
    const status = await getMailboxSimulationStatus();
    res.json(status);
  } catch (err) {
    logger.error("metrics", "mailbox-ingest simulation status failed", { error: err.message });
    res.status(500).json({ error: "mailbox_ingest_simulation_failed" });
  }
});

/**
 * POST /metrics/mailbox-ingest/simulation — start/stop Go mailbox simulation (dev; admin/developer).
 */
router.post("/mailbox-ingest/simulation", requirePermission("dev.simulation"), async (req, res) => {
  try {
    const action = String(req.body.action || "").toLowerCase();
    if (action === "start") {
      const emailsPerMinute = Number(req.body.emailsPerMinute) || 1;
      const result = await postMailboxSimulation("start", { emailsPerMinute });
      return res.json(result);
    }
    if (action === "stop") {
      const result = await postMailboxSimulation("stop");
      return res.json(result);
    }
    return res.status(400).json({ error: "invalid_action" });
  } catch (err) {
    logger.error("metrics", "mailbox-ingest simulation control failed", { error: err.message });
    res.status(502).json({ error: "mailbox_ingest_simulation_failed", detail: err.message });
  }
});

/**
 * GET /metrics/verdict-delivery — outbound webhook stats + mock callback receiver snapshot.
 * Pattern: Mongo verdictDelivery audit fields + optional mock-verdict-callback HTTP proxy.
 */
router.get("/verdict-delivery", requirePermission("metrics.read"), async (_req, res) => {
  try {
    const delivery = await getVerdictDeliveryMetrics();
    const mockStats = await getMockVerdictCallbackStats();
    const mockCallbacks = await getMockVerdictCallbacks(15);
    res.json({
      delivery,
      mockReceiver: mockStats,
      mockCallbacks: mockCallbacks?.callbacks || [],
      simulationTemplates: listPhishingSimulationTemplates(),
    });
  } catch (err) {
    logger.error("metrics", "verdict-delivery failed", { error: err.message });
    res.status(500).json({ error: "verdict_delivery_metrics_failed" });
  }
});

module.exports = router;
