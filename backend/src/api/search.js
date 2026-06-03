/**
 * REST routes for Elasticsearch review search (optional laptop-friendly dev stack).
 */
const express = require("express");
const {
  searchReviews,
  clearReviewIndex,
  getSearchIndexStats,
} = require("../search/reviewSearchIndex");
const { isElasticsearchEnabled } = require("../search/elasticClient");
const { authenticate, requirePermission } = require("../http/middleware/auth");
const logger = require("../lib/logger");

const router = express.Router();

/** GET /search/status — whether ES is enabled and how many docs are indexed. */
router.get("/status", authenticate, requirePermission("reviews.read"), async (_req, res) => {
  try {
    const stats = await getSearchIndexStats();
    res.json({
      ...stats,
      enabled: isElasticsearchEnabled(),
    });
  } catch (err) {
    logger.error("search", "status failed", { error: err.message });
    res.status(500).json({ error: "search_status_failed" });
  }
});

/** GET /search/reviews?q=keyword — full-text search (reviews.read). */
router.get("/reviews", authenticate, requirePermission("reviews.read"), async (req, res) => {
  try {
    const result = await searchReviews({
      query: req.query.q || req.query.query || "",
      limit: req.query.limit,
    });
    res.json(result);
  } catch (err) {
    logger.error("search", "query failed", { error: err.message });
    res.status(500).json({ error: "search_query_failed" });
  }
});

/** DELETE /search/index — wipe all indexed reviews (admin or dev.reset + developer). */
router.delete(
  "/index",
  authenticate,
  requirePermission("dev.reset"),
  async (req, res) => {
    if (!req.auth.roles.includes("developer") && !req.auth.roles.includes("admin")) {
      return res.status(403).json({ error: "admin_or_developer_required" });
    }
    try {
      const result = await clearReviewIndex();
      res.json({ ok: result.cleared, ...result });
    } catch (err) {
      logger.error("search", "clear index failed", { error: err.message });
      res.status(500).json({ error: "search_clear_failed" });
    }
  }
);

module.exports = router;
