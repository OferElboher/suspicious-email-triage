/**
 * Internal mailbox ingest route — called by the Go ingest-gateway (not browser JWT).
 *
 * Pattern: same as graphInternal.js — shared secret header before JWT middleware in createApp.
 * Technology: Express Router, Mongoose Review.create, reviewPipeline.enqueueAfterCreate.
 */
const express = require("express");
const Review = require("../models/Review");
const logger = require("../lib/logger");
const { extractLinks } = require("../lib/extractLinks");
const { enqueueAfterCreate } = require("../services/reviewPipeline");
const { scheduleGraphSync } = require("../services/graphSyncService");
const { scheduleSearchIndex } = require("../services/reviewSearchSync");
const { incrementReviewsCreated } = require("../lib/appMetrics");

/** router: internal ingest routes mounted at /ingest/internal before JWT auth. */
const router = express.Router();

/** Compare X-Ingest-Internal-Token header to INGEST_INTERNAL_TOKEN env (shared with Go gateway). */
function internalTokenValid(req) {
  const expected = process.env.INGEST_INTERNAL_TOKEN || "dev-ingest-internal-token";
  const provided = req.get("X-Ingest-Internal-Token") || "";
  return expected && provided === expected;
}

/** Allowed source values for mailbox ingest (simulation vs real webhook). */
const MAILBOX_SOURCES = new Set(["mailbox_ingest", "mailbox_simulation"]);

/**
 * POST /ingest/internal/mailbox — persist one email-shaped review and enqueue Kafka ingest.
 * Body: { senderName, senderEmail, subject, body, source }
 */
router.post("/mailbox", async (req, res) => {
  if (!internalTokenValid(req)) {
    return res.status(401).json({ error: "invalid_internal_token" });
  }
  try {
    const senderName = String(req.body.senderName || "Unknown Sender").trim();
    const senderEmail = String(req.body.senderEmail || "").trim();
    const subject = String(req.body.subject || "").trim();
    const body = String(req.body.body || "").trim();
    const source = String(req.body.source || "mailbox_ingest").trim();

    if (!senderEmail || !subject || !body) {
      return res.status(400).json({ error: "missing_required_fields" });
    }
    if (!MAILBOX_SOURCES.has(source)) {
      return res.status(400).json({ error: "invalid_source" });
    }

    const links = extractLinks(body);
    const review = await Review.create({
      senderName,
      senderEmail,
      subject,
      body,
      links,
      source,
      status: "pending",
    });

    await enqueueAfterCreate(review._id);
    scheduleGraphSync(review._id);
    scheduleSearchIndex(review._id);
    incrementReviewsCreated();

    logger.info("ingest", "internal mailbox review created", {
      reviewId: review._id.toString(),
      source,
    });

    return res.status(201).json({ id: review._id.toString(), status: review.status });
  } catch (err) {
    logger.error("ingest", "internal mailbox create failed", { error: err.message });
    return res.status(500).json({ error: "ingest_failed" });
  }
});

module.exports = router;
