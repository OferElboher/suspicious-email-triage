/**
 * Outbound verdict delivery — POST webhook to mail platforms when analysis completes or override changes.
 *
 * Pattern: fire-and-forget scheduleVerdictDelivery (like scheduleSnowflakeExport);
 * Celery triggers via POST /ingest/internal/verdict-deliver/:id after scoring.
 * Technology: Node fetch, HMAC X-Verdict-Signature, Postgres ingest_clients registry, optional Kafka event.
 */
const Review = require("../models/Review");
const logger = require("../lib/logger");
const { signVerdictPayload } = require("../lib/verdictCallbackSign");
const {
  effectiveVerdict,
  effectiveRecommendedAction,
} = require("../lib/effectiveVerdict");
const { publishReviewCompleted } = require("../kafka/reviewCompletedProducer");
const { getIngestClient } = require("../ingest/ingestClientsPg");

/** Maximum delivery attempts before marking failed (in-process retries). */
const MAX_ATTEMPTS = 3;

/** Backoff milliseconds between retry attempts. */
const RETRY_MS = [0, 500, 1500];

/**
 * Resolve callback URL priority:
 * 1) per-message review.callbackUrl (one-off override)
 * 2) Postgres ingest_clients.callback_url for review.ingestClientId (per mail platform)
 * 3) VERDICT_CALLBACK_URL env (single-tenant dev fallback only)
 * @param {import("../models/Review")} review
 * @returns {Promise<string|null>}
 */
async function resolveCallbackUrl(review) {
  const perMessage = String(review.callbackUrl || "").trim();
  if (perMessage) {
    return perMessage;
  }
  const clientId = String(review.ingestClientId || "").trim();
  if (clientId) {
    const client = await getIngestClient(clientId);
    if (client?.callback_url) {
      return String(client.callback_url).trim();
    }
    logger.warn("verdict_delivery", "unknown or inactive ingestClientId", {
      ingestClientId: clientId,
      reviewId: review._id?.toString(),
    });
  }
  const envDefault = String(process.env.VERDICT_CALLBACK_URL || "").trim();
  return envDefault || null;
}

/**
 * Build the JSON body mail platforms receive on the verdict webhook.
 * @param {object} review — plain object or mongoose doc
 * @param {string} reason — analysis_complete | override
 */
function buildVerdictPayload(review, reason) {
  const id = review._id ? review._id.toString() : String(review.id);
  const verdict = effectiveVerdict(review);
  const recommendedAction = effectiveRecommendedAction(review);
  return {
    reviewId: id,
    externalMessageId: review.externalMessageId || null,
    ingestClientId: review.ingestClientId || null,
    status: review.status,
    verdict: verdict || null,
    recommendedAction: recommendedAction || null,
    effectiveVerdict: verdict || null,
    source: review.source || null,
    reason,
    completedAt: new Date().toISOString(),
    analysisVerdict: review.analysisResult?.verdict || null,
    overrideVerdict: review.override?.verdict || null,
  };
}

/**
 * Sleep helper for retry backoff.
 * @param {number} ms
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POST verdict JSON to callbackUrl with HMAC signature header.
 * @param {string} callbackUrl
 * @param {object} payload
 * @returns {Promise<{ ok: boolean, status: number, error?: string }>}
 */
async function postVerdictWebhook(callbackUrl, payload) {
  const signature = signVerdictPayload(payload);
  try {
    const response = await fetch(callbackUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Verdict-Signature": signature,
        "X-Verdict-Event": payload.reason || "verdict",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(Number(process.env.VERDICT_CALLBACK_TIMEOUT_MS || 8000)),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return { ok: false, status: response.status, error: text.slice(0, 200) };
    }
    return { ok: true, status: response.status };
  } catch (err) {
    return { ok: false, status: 0, error: err.message };
  }
}

/**
 * Deliver verdict for one review — updates Mongo verdictDelivery audit fields.
 * @param {string} reviewId
 * @param {string} reason
 */
async function deliverVerdictForReview(reviewId, reason) {
  const review = await Review.findById(reviewId);
  if (!review) {
    logger.warn("verdict_delivery", "review not found", { reviewId });
    return { skipped: true, reason: "not_found" };
  }

  const callbackUrl = await resolveCallbackUrl(review);
  if (!callbackUrl) {
    await Review.updateOne(
      { _id: review._id },
      {
        $set: {
          verdictDelivery: {
            status: "skipped",
            reason,
            attempts: 0,
            lastError: "no_callback_url",
            deliveredAt: null,
            lastHttpStatus: null,
          },
        },
      }
    );
    logger.info("verdict_delivery", "skipped — no callback URL", {
      reviewId,
      ingestClientId: review.ingestClientId || null,
    });
    return { skipped: true, reason: "no_callback_url" };
  }

  const verdict = effectiveVerdict(review);
  if (!verdict && review.status !== "failed") {
    await Review.updateOne(
      { _id: review._id },
      {
        $set: {
          verdictDelivery: {
            status: "skipped",
            reason,
            attempts: 0,
            lastError: "no_verdict_yet",
            deliveredAt: null,
            lastHttpStatus: null,
          },
        },
      }
    );
    return { skipped: true, reason: "no_verdict_yet" };
  }

  const payload = buildVerdictPayload(review.toObject(), reason);
  let lastError = "";
  let lastStatus = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (RETRY_MS[attempt - 1]) {
      await delay(RETRY_MS[attempt - 1]);
    }
    const result = await postVerdictWebhook(callbackUrl, payload);
    lastStatus = result.status;
    if (result.ok) {
      await Review.updateOne(
        { _id: review._id },
        {
          $set: {
            verdictDelivery: {
              status: "delivered",
              reason,
              attempts: attempt,
              lastError: null,
              deliveredAt: new Date(),
              lastHttpStatus: result.status,
            },
          },
        }
      );
      logger.info("verdict_delivery", "webhook delivered", {
        reviewId,
        externalMessageId: review.externalMessageId,
        ingestClientId: review.ingestClientId,
        verdict: payload.verdict,
        httpStatus: result.status,
      });
      try {
        await publishReviewCompleted(reviewId, payload);
      } catch (kafkaErr) {
        logger.warn("verdict_delivery", "kafka completed publish failed", {
          reviewId,
          error: kafkaErr.message,
        });
      }
      return { delivered: true, attempts: attempt, callbackUrl };
    }
    lastError = result.error || `http_${result.status}`;
    logger.warn("verdict_delivery", "webhook attempt failed", {
      reviewId,
      attempt,
      status: result.status,
      error: lastError,
    });
  }

  await Review.updateOne(
    { _id: review._id },
    {
      $set: {
        verdictDelivery: {
          status: "failed",
          reason,
          attempts: MAX_ATTEMPTS,
          lastError: lastError,
          deliveredAt: null,
          lastHttpStatus: lastStatus || null,
        },
      },
    }
  );
  return { delivered: false, error: lastError };
}

/**
 * Schedule async verdict delivery without blocking the HTTP handler.
 * @param {string|import("mongoose").Types.ObjectId} reviewId
 * @param {string} reason
 */
function scheduleVerdictDelivery(reviewId, reason) {
  const id = reviewId.toString();
  setImmediate(() => {
    deliverVerdictForReview(id, reason).catch((err) => {
      logger.error("verdict_delivery", "unhandled delivery error", {
        reviewId: id,
        error: err.message,
      });
    });
  });
}

/**
 * Aggregate delivery stats for metrics dashboard.
 */
async function getVerdictDeliveryMetrics() {
  const { listIngestClients } = require("../ingest/ingestClientsPg");
  const [delivered, failed, skipped, pending, clients] = await Promise.all([
    Review.countDocuments({ "verdictDelivery.status": "delivered" }),
    Review.countDocuments({ "verdictDelivery.status": "failed" }),
    Review.countDocuments({ "verdictDelivery.status": "skipped" }),
    Review.countDocuments({
      status: "completed",
      "verdictDelivery.status": { $exists: false },
      $or: [
        { callbackUrl: { $exists: true, $ne: "" } },
        { ingestClientId: { $exists: true, $ne: "" } },
        { source: { $in: ["mailbox_ingest", "mailbox_simulation"] } },
      ],
    }),
    listIngestClients({ includeInactive: true }),
  ]);
  const recent = await Review.find({ "verdictDelivery.status": { $exists: true } })
    .sort({ "verdictDelivery.deliveredAt": -1, updatedAt: -1 })
    .limit(10)
    .select(
      "externalMessageId ingestClientId source status analysisResult.verdict override.verdict verdictDelivery updatedAt"
    )
    .lean();

  return {
    enabled:
      process.env.VERDICT_DELIVERY_ENABLED !== "false" &&
      (clients.length > 0 || Boolean(process.env.VERDICT_CALLBACK_URL)),
    devFallbackCallbackUrl: process.env.VERDICT_CALLBACK_URL || null,
    registeredClients: clients.map((row) => ({
      clientId: row.client_id,
      displayName: row.display_name,
      callbackUrl: row.callback_url,
      isActive: row.is_active,
      updatedAt: row.updated_at,
    })),
    counts: { delivered, failed, skipped, pending },
    recent: recent.map((row) => ({
      reviewId: String(row._id),
      externalMessageId: row.externalMessageId,
      ingestClientId: row.ingestClientId,
      source: row.source,
      status: row.status,
      effectiveVerdict: effectiveVerdict(row),
      delivery: row.verdictDelivery,
      updatedAt: row.updatedAt,
    })),
  };
}

module.exports = {
  buildVerdictPayload,
  deliverVerdictForReview,
  scheduleVerdictDelivery,
  getVerdictDeliveryMetrics,
  resolveCallbackUrl,
};
