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
const { scheduleGraphSync } = require("../services/graphSyncService");
const { scheduleSearchIndex } = require("../services/reviewSearchSync");
const { effectiveVerdict } = require("../lib/effectiveVerdict");
const { dayBoundsUtc, pageIndexForDate } = require("../lib/dateNav");
const { incrementReviewsCreated } = require("../lib/appMetrics");
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
      source: "user",
      status: "pending",
    });

    await enqueueAfterCreate(review._id);
    scheduleGraphSync(review._id);
    scheduleSearchIndex(review._id);
    incrementReviewsCreated();

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
    scheduleGraphSync(review._id);
    scheduleSearchIndex(review._id);
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
    const includeSimulation =
      String(req.query.includeSimulation || "").toLowerCase() === "true" ||
      req.query.includeSimulation === "1";
    const safePage = Math.max(page, 0);
    const safeLimit = Math.min(Math.max(limit, 1), REVIEW_PAGE_SIZE);
    const filter = includeSimulation ? {} : { source: { $ne: "dev_simulation" } };
    const total = await Review.countDocuments(filter);
    const reviews = await Review.find(filter)
      .sort({ updatedAt: -1 })
      .skip(safePage * safeLimit)
      .limit(safeLimit)
      .select("senderEmail subject status source analysisResult.verdict override updatedAt");
    const data = reviews.map((doc) => {
      const row = doc.toObject ? doc.toObject() : doc;
      return {
        ...row,
        effectiveVerdict: effectiveVerdict(row),
      };
    });
    return res.json({
      data,
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

/**
 * GET /reviews/page-for-date — page index (zero-based) for first review on a calendar day.
 * List sort is updatedAt DESC; page = count of rows newer than end-of-day / page size.
 */
router.get("/page-for-date", requirePermission("reviews.read"), async (req, res) => {
  try {
    const bounds = dayBoundsUtc(req.query.date);
    if (!bounds) {
      return res.status(400).json({ error: "invalid_date", hint: "Use YYYY-MM-DD" });
    }
    const limit = Math.min(
      Math.max(parseInt(req.query.limit ?? DEFAULT_LIMIT, 10), 1),
      REVIEW_PAGE_SIZE
    );
    const includeSimulation =
      String(req.query.includeSimulation || "").toLowerCase() === "true" ||
      req.query.includeSimulation === "1";
    const filter = includeSimulation ? {} : { source: { $ne: "dev_simulation" } };
    const onDayCount = await Review.countDocuments({
      ...filter,
      updatedAt: { $gte: bounds.start, $lte: bounds.end },
    });
    if (onDayCount === 0) {
      return res.status(404).json({ error: "no_reviews_on_date", date: bounds.date });
    }
    const newerCount = await Review.countDocuments({
      ...filter,
      updatedAt: { $gt: bounds.end },
    });
    const page = pageIndexForDate(newerCount, limit);
    return res.json({
      date: bounds.date,
      page,
      limit,
      onDayCount,
      totalNewer: newerCount,
    });
  } catch (err) {
    logger.error("reviews", "page-for-date failed", { error: err.message });
    return res.status(500).json({ error: "page_for_date_failed" });
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
