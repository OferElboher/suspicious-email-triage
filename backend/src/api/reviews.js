/**
 * Reviews REST: create (Kafka + optional BullMQ), list, detail, analyst override.
 */
const express = require("express");
const router = express.Router();
const Review = require("../models/Review");
const { extractLinks } = require("../lib/extractLinks");
const { REVIEW_PAGE_SIZE } = require("../../../shared/config/pagination");
const logger = require("../lib/logger");
const { enqueueAfterCreate } = require("../services/reviewPipeline");
const { requirePermission } = require("../http/middleware/auth");

/** Default page index for GET /reviews pagination (zero-based). */
const DEFAULT_PAGE = 0;
/** Default page size is bound to shared REVIEW_PAGE_SIZE for UI/API parity. */
const DEFAULT_LIMIT = REVIEW_PAGE_SIZE;

/** POST /reviews — persists a review and enqueues async analysis (Kafka/Celery primary path). */
router.post("/", requirePermission("reviews.write"), async (req, res) => {
  try {
    const { senderName, senderEmail, subject, body, referenceSources } =
      req.body;
    if (!senderName || !senderEmail || !subject || !body) {
      return res.status(400).json({ error: "missing_fields" });
    }
    const links = extractLinks(body);
    const review = await Review.create({
      senderName,
      senderEmail,
      subject,
      body,
      links,
      referenceSources,
      status: "pending",
    });

    await enqueueAfterCreate(review._id);

    logger.info("reviews", "created", { id: String(review._id) });
    return res.status(201).json({ id: review._id, status: review.status });
  } catch (err) {
    logger.error("reviews", "create failed", { error: err.message });
    return res.status(500).json({ error: "Failed to create review" });
  }
});

/** POST /reviews/:id/override — analyst audit trail for manual verdict adjustments. */
router.post("/:id/override", requirePermission("reviews.override"), async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ error: "not_found" });
    }
    review.override = {
      verdict: req.body.verdict,
      recommendedAction: req.body.recommendedAction,
      reason: req.body.reason,
      analystEmail: req.auth.email,
      timestamp: new Date(),
    };
    await review.save();
    logger.info("reviews", "override saved", { id: String(review._id) });
    return res.json({ ok: true, review });
  } catch (err) {
    logger.error("reviews", "override failed", { error: err.message });
    return res.status(500).json({ error: "internal_error" });
  }
});

/** GET /reviews — paginated dashboard rows sorted by recent activity. */
router.get("/", requirePermission("reviews.read"), async (req, res) => {
  try {
    const page = parseInt(req.query.page ?? DEFAULT_PAGE, 10);
    const limit = parseInt(req.query.limit ?? DEFAULT_LIMIT, 10);
    const safePage = Math.max(page, 0);
    const safeLimit = Math.min(Math.max(limit, 1), REVIEW_PAGE_SIZE);
    const total = await Review.countDocuments();
    const reviews = await Review.find()
      .sort({ updatedAt: -1 })
      .skip(safePage * safeLimit)
      .limit(safeLimit)
      .select("senderEmail subject status analysisResult.verdict updatedAt");
    return res.json({
      data: reviews,
      page: safePage,
      limit: safeLimit,
      total,
      hasMore: safePage * safeLimit + reviews.length < total,
    });
  } catch (err) {
    logger.error("reviews", "list failed", { error: err.message });
    return res.status(500).json({ error: "Failed to fetch reviews" });
  }
});

/** GET /reviews/:id — full document for polling and analyst deep-read. */
router.get("/:id", requirePermission("reviews.read"), async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ error: "Review not found" });
    }
    return res.json(review);
  } catch (err) {
    logger.error("reviews", "get failed", { error: err.message });
    return res.status(500).json({ error: "Failed to fetch review" });
  }
});

module.exports = router;
