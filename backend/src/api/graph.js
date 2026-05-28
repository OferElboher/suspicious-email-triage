/**
 * Graph REST API: campaigns, neighborhoods, visualization, and internal worker sync.
 */
const express = require("express");
const router = express.Router();
const Review = require("../models/Review");
const { requirePermission } = require("../http/middleware/auth");
const { isNeo4jEnabled } = require("../graph/neo4jClient");
const { listCampaigns } = require("../graph/campaignDetection");
const { getReviewNeighborhood, getVisualizationGraph } = require("../graph/graphQueries");
const { syncReviewGraphById } = require("../services/graphSyncService");
const logger = require("../lib/logger");

/** GET /graph/status — whether Neo4j is enabled and reachable enough for reads. */
router.get("/status", requirePermission("graph.read"), async (_req, res) => {
  return res.json({
    enabled: isNeo4jEnabled(),
    service: "neo4j-phishing-graph",
  });
});

/** GET /graph/campaigns — shared-indicator clusters (domains reused across risky reviews). */
router.get("/campaigns", requirePermission("graph.read"), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 200);
    const campaigns = await listCampaigns(limit);
    return res.json({ campaigns });
  } catch (err) {
    logger.error("graph", "campaigns failed", { error: err.message });
    return res.status(500).json({ error: "graph_campaigns_failed" });
  }
});

/** GET /graph/review/:id/neighborhood — local subgraph for one review id. */
router.get("/review/:id/neighborhood", requirePermission("graph.read"), async (req, res) => {
  try {
    const depth = Math.min(parseInt(req.query.depth || "2", 10), 4);
    const graph = await getReviewNeighborhood(req.params.id, depth);
    return res.json(graph);
  } catch (err) {
    logger.error("graph", "neighborhood failed", { error: err.message });
    return res.status(500).json({ error: "graph_neighborhood_failed" });
  }
});

/** GET /graph/visualization — nodes + edges for the React SVG graph view. */
router.get("/visualization", requirePermission("graph.read"), async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "40", 10), 100);
    const graph = await getVisualizationGraph(limit);
    return res.json(graph);
  } catch (err) {
    logger.error("graph", "visualization failed", { error: err.message });
    return res.status(500).json({ error: "graph_visualization_failed" });
  }
});

/** POST /graph/sync/:id — authenticated manual re-sync (developer troubleshooting). */
router.post("/sync/:id", requirePermission("graph.read"), async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ error: "not_found" });
    }
    const result = await syncReviewGraphById(req.params.id);
    return res.json(result);
  } catch (err) {
    logger.error("graph", "manual sync failed", { error: err.message });
    return res.status(500).json({ error: "graph_sync_failed" });
  }
});

module.exports = router;
