/**
 * Internal graph sync route mounted before JWT auth so Celery can call it with a service token.
 */
const express = require("express");
const router = express.Router();
const { syncReviewGraphById } = require("../services/graphSyncService");
const { scheduleSearchIndex } = require("../services/reviewSearchSync");
const { scheduleSnowflakeExport } = require("../analytics/snowflakeExport");
const logger = require("../lib/logger");

/** Compare X-Graph-Internal-Token header to GRAPH_INTERNAL_TOKEN env (shared secret). */
function internalTokenValid(req) {
  // Fallback string matches dev .env.dev only — production must set GRAPH_INTERNAL_TOKEN explicitly.
  const expected = process.env.GRAPH_INTERNAL_TOKEN || "dev-graph-sync-token";
  const provided = req.get("X-Graph-Internal-Token") || "";
  return expected && provided === expected;
}

/** POST /graph/internal/sync/:id — worker callback after analysis completes. */
router.post("/sync/:id", async (req, res) => {
  if (!internalTokenValid(req)) {
    return res.status(401).json({ error: "invalid_internal_token" });
  }
  try {
    const result = await syncReviewGraphById(req.params.id);
    scheduleSearchIndex(req.params.id);
    scheduleSnowflakeExport(req.params.id);
    if (result.reason === "not_found") {
      return res.status(404).json({ error: "not_found" });
    }
    return res.json(result);
  } catch (err) {
    logger.error("graph", "internal sync failed", { error: err.message });
    return res.status(500).json({ error: "graph_sync_failed" });
  }
});

module.exports = router;
