/**
 * Internal agent tool routes — mounted before JWT auth for Celery service token calls.
 *
 * Pattern: same security model as graphInternal.js (shared secret header, not user JWT).
 * Technology: Express router; Mongo/Neo4j reads for agent tool allowlist in ai_service.
 */
const express = require("express");
const router = express.Router();
const Review = require("../models/Review");
const { getReviewNeighborhood } = require("../graph/graphQueries");
const logger = require("../lib/logger");

/** Compare X-Agent-Internal-Token to AGENT_INTERNAL_SERVICE_TOKEN (falls back to graph token in dev). */
function agentTokenValid(req) {
  const expected =
    process.env.AGENT_INTERNAL_SERVICE_TOKEN ||
    process.env.GRAPH_INTERNAL_TOKEN ||
    "dev-graph-sync-token";
  const provided = req.get("X-Agent-Internal-Token") || "";
  return Boolean(expected) && provided === expected;
}

/** Reject missing/invalid service token before any tool handler runs. */
function requireAgentToken(req, res, next) {
  if (!agentTokenValid(req)) {
    return res.status(401).json({ error: "invalid_agent_internal_token" });
  }
  return next();
}

router.use(requireAgentToken);

/** GET /agent/internal/review/:id — Mongo review snapshot for agent get_review_by_id tool. */
router.get("/review/:id", async (req, res) => {
  try {
    const review = await Review.findById(req.params.id).lean();
    if (!review) {
      return res.status(404).json({ error: "not_found" });
    }
    return res.json({ found: true, review });
  } catch (err) {
    logger.error("agent", "internal review fetch failed", { error: err.message });
    return res.status(500).json({ error: "agent_review_fetch_failed" });
  }
});

/** GET /agent/internal/graph/review/:id/neighborhood — Neo4j subgraph for campaign tools. */
router.get("/graph/review/:id/neighborhood", async (req, res) => {
  try {
    const depth = Math.min(parseInt(req.query.depth || "1", 10), 2);
    const graph = await getReviewNeighborhood(req.params.id, depth);
    return res.json(graph);
  } catch (err) {
    logger.error("agent", "internal neighborhood failed", { error: err.message });
    return res.status(500).json({ error: "agent_neighborhood_failed" });
  }
});

/** GET /agent/internal/sender-history — recent reviews from same sender for repeat-offender workflow. */
router.get("/sender-history", async (req, res) => {
  try {
    const email = String(req.query.email || "").trim();
    if (!email) {
      return res.status(400).json({ error: "email_required" });
    }
    const limit = Math.min(parseInt(req.query.limit || "5", 10), 10);
    const reviews = await Review.find({ senderEmail: email })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("_id senderEmail subject status analysisResult.verdict createdAt")
      .lean();
    return res.json({
      senderEmail: email,
      count: reviews.length,
      reviews,
    });
  } catch (err) {
    logger.error("agent", "sender history failed", { error: err.message });
    return res.status(500).json({ error: "agent_sender_history_failed" });
  }
});

module.exports = router;
