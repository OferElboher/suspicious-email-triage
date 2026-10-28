/**
 * This module maps a completed Review document into the row shape expected by snowflakeClient.js insert APIs.
 *
 * It runs after automated scoring or analyst override when warehouse export is enabled.
 *
 * Keeping mapping separate from HTTP client code clarifies which fields become analytics dimensions.
 *
 * Failures are logged but do not block review completion in the triage UI.
 */
const Review = require("../models/Review");
const logger = require("../lib/logger");
const { isSnowflakeEnabled, insertRows } = require("./snowflakeClient");
const { buildExportPayload } = require("./reviewToSnowflakeRow");
const { ANALYTICS_TABLES } = require("./snowflakeSchemas");

/** Only completed reviews with analysis results are warehouse-ready. */
function isExportableReview(review) {
  return Boolean(
    review &&
      review.status === "completed" &&
      review.analysisResult &&
      review.analysisResult.verdict
  );
}

/** Upsert one review into all analytical Snowflake tables. */
async function exportReviewToSnowflake(review) {
  if (!isSnowflakeEnabled()) {
    return { exported: false, reason: "disabled" };
  }
  if (!isExportableReview(review)) {
    return { exported: false, reason: "not_exportable", status: review?.status };
  }

  const payload = buildExportPayload(review);
  const results = {};

  for (const [table, rows] of Object.entries(payload)) {
    if (!rows.length) {
      continue;
    }
    const response = await insertRows(table, rows);
    results[table] = response;
    if (!response.ok) {
      logger.warn("snowflake", "table export failed", {
        table,
        reviewId: String(review._id),
        response,
      });
      return { exported: false, reason: "insert_failed", table, results };
    }
  }

  logger.info("snowflake", "review exported", { reviewId: String(review._id) });
  return { exported: true, reviewId: String(review._id), results };
}

/** Load review from Mongo and export to Snowflake (non-fatal on failure). */
async function syncReviewSnowflakeById(reviewId) {
  try {
    const review = await Review.findById(reviewId);
    if (!review) {
      return { exported: false, reason: "not_found" };
    }
    return await exportReviewToSnowflake(review);
  } catch (err) {
    logger.warn("snowflake", "syncReviewSnowflakeById failed", {
      reviewId: String(reviewId),
      error: err.message,
    });
    return { exported: false, reason: err.message };
  }
}

/** Schedule Snowflake export without blocking HTTP handlers. */
function scheduleSnowflakeExport(reviewId) {
  syncReviewSnowflakeById(reviewId).catch((err) => {
    logger.warn("snowflake", "background export failed", {
      reviewId: String(reviewId),
      error: err.message,
    });
  });
}

/** Export all completed reviews (dev backfill / admin batch). */
async function exportAllCompletedReviews(limit = 500) {
  const reviews = await Review.find({
    status: "completed",
    "analysisResult.verdict": { $exists: true },
  })
    .sort({ updatedAt: -1 })
    .limit(Math.min(Math.max(Number(limit) || 500, 1), 2000));

  let exported = 0;
  let skipped = 0;
  for (const review of reviews) {
    const result = await exportReviewToSnowflake(review);
    if (result.exported) {
      exported += 1;
    } else {
      skipped += 1;
    }
  }
  return { exported, skipped, scanned: reviews.length };
}

module.exports = {
  ANALYTICS_TABLES,
  isExportableReview,
  exportReviewToSnowflake,
  syncReviewSnowflakeById,
  scheduleSnowflakeExport,
  exportAllCompletedReviews,
};
