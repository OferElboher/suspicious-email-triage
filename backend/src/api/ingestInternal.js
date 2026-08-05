/**
 * Internal mailbox ingest + verdict delivery routes — called by Go gateway and Celery (not browser JWT).
 *
 * Pattern: same as graphInternal.js — shared secret header before JWT middleware in createApp.
 * Technology: Express Router, Mongoose Review, reviewPipeline, verdictDelivery service.
 */
const express = require("express");
const Review = require("../models/Review");
const logger = require("../lib/logger");
const { extractLinks } = require("../lib/extractLinks");
const { effectiveVerdict, effectiveRecommendedAction } = require("../lib/effectiveVerdict");
const { enqueueAfterCreate } = require("../services/reviewPipeline");
const { scheduleGraphSync } = require("../services/graphSyncService");
const { scheduleSearchIndex } = require("../services/reviewSearchSync");
const { incrementReviewsCreated } = require("../lib/appMetrics");
const {
  deliverVerdictForReview,
  buildVerdictPayload,
} = require("../services/verdictDelivery");
const {
  getIngestClient,
  listIngestClients,
  upsertIngestClient,
} = require("../ingest/ingestClientsPg");

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
 * Body: { senderName, senderEmail, subject, body, source, externalMessageId?, callbackUrl?, ingestClientId? }
 * Header alternative: X-Ingest-Client-Id (same as ingestClientId body field)
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
    const externalMessageId = String(req.body.externalMessageId || "").trim() || undefined;
    const callbackUrl = String(req.body.callbackUrl || "").trim() || undefined;
    const ingestClientId =
      String(req.body.ingestClientId || req.get("X-Ingest-Client-Id") || "").trim() || undefined;

    if (!senderEmail || !subject || !body) {
      return res.status(400).json({ error: "missing_required_fields" });
    }
    if (!MAILBOX_SOURCES.has(source)) {
      return res.status(400).json({ error: "invalid_source" });
    }
    if (ingestClientId) {
      const client = await getIngestClient(ingestClientId);
      if (!client) {
        return res.status(400).json({ error: "unknown_ingest_client", ingestClientId });
      }
    }

    const links = extractLinks(body);
    const review = await Review.create({
      senderName,
      senderEmail,
      subject,
      body,
      links,
      source,
      externalMessageId,
      callbackUrl,
      ingestClientId,
      status: "pending",
    });

    await enqueueAfterCreate(review._id);
    scheduleGraphSync(review._id);
    scheduleSearchIndex(review._id);
    incrementReviewsCreated();

    logger.info("ingest", "internal mailbox review created", {
      reviewId: review._id.toString(),
      source,
      externalMessageId: externalMessageId || null,
      ingestClientId: ingestClientId || null,
    });

    return res.status(201).json({
      id: review._id.toString(),
      status: review.status,
      externalMessageId: review.externalMessageId || null,
      ingestClientId: review.ingestClientId || null,
    });
  } catch (err) {
    logger.error("ingest", "internal mailbox create failed", { error: err.message });
    return res.status(500).json({ error: "ingest_failed" });
  }
});

/**
 * GET /ingest/internal/verdict/:id — polling API for mail platforms (internal token, not JWT).
 * Returns current status and effective verdict so adapters can pull without webhooks.
 */
router.get("/verdict/:id", async (req, res) => {
  if (!internalTokenValid(req)) {
    return res.status(401).json({ error: "invalid_internal_token" });
  }
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ error: "not_found" });
    }
    const row = review.toObject();
    return res.json({
      reviewId: review._id.toString(),
      externalMessageId: review.externalMessageId || null,
      ingestClientId: review.ingestClientId || null,
      status: review.status,
      verdict: effectiveVerdict(row),
      recommendedAction: effectiveRecommendedAction(row),
      analysisVerdict: review.analysisResult?.verdict || null,
      overrideVerdict: review.override?.verdict || null,
      verdictDelivery: review.verdictDelivery || null,
      updatedAt: review.updatedAt,
    });
  } catch (err) {
    logger.error("ingest", "verdict poll failed", { error: err.message });
    return res.status(500).json({ error: "verdict_poll_failed" });
  }
});

/**
 * POST /ingest/internal/verdict-deliver/:id — trigger outbound webhook (Celery callback).
 * Body optional: { reason: "analysis_complete" | "override" }
 */
router.post("/verdict-deliver/:id", async (req, res) => {
  if (!internalTokenValid(req)) {
    return res.status(401).json({ error: "invalid_internal_token" });
  }
  try {
    const reason = String(req.body?.reason || "analysis_complete");
    const result = await deliverVerdictForReview(req.params.id, reason);
    const review = await Review.findById(req.params.id).lean();
    return res.json({
      ok: true,
      result,
      payload: review ? buildVerdictPayload(review, reason) : null,
    });
  } catch (err) {
    logger.error("ingest", "verdict deliver failed", { error: err.message });
    return res.status(500).json({ error: "verdict_deliver_failed" });
  }
});

/**
 * GET /ingest/internal/clients — list registered mail platform webhook defaults (Postgres ingest_clients).
 */
router.get("/clients", async (req, res) => {
  if (!internalTokenValid(req)) {
    return res.status(401).json({ error: "invalid_internal_token" });
  }
  try {
    const clients = await listIngestClients({ includeInactive: true });
    return res.json({ clients });
  } catch (err) {
    logger.error("ingest", "list clients failed", { error: err.message });
    return res.status(500).json({ error: "list_clients_failed" });
  }
});

/**
 * PUT /ingest/internal/clients/:clientId — register or update one mail platform default webhook URL.
 * Body: { displayName, callbackUrl, isActive? }
 */
router.put("/clients/:clientId", async (req, res) => {
  if (!internalTokenValid(req)) {
    return res.status(401).json({ error: "invalid_internal_token" });
  }
  try {
    const row = await upsertIngestClient({
      clientId: req.params.clientId,
      displayName: req.body.displayName,
      callbackUrl: req.body.callbackUrl,
      isActive: req.body.isActive !== false,
    });
    return res.json({ client: row });
  } catch (err) {
    if (err.message === "missing_required_fields" || err.message === "callback_url_must_be_http_or_https") {
      return res.status(400).json({ error: err.message });
    }
    logger.error("ingest", "upsert client failed", { error: err.message });
    return res.status(500).json({ error: "upsert_client_failed" });
  }
});

module.exports = router;
