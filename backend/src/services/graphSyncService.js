/**
 * Fire-and-forget graph sync wrapper used by review routes and internal callbacks.
 */
const Review = require("../models/Review");
const { syncReviewToGraph } = require("../graph/syncReview");
const { incrementGraphSyncFailures } = require("../lib/appMetrics");
const logger = require("../lib/logger");

/** Load a review from Mongo and upsert its graph neighborhood (never throws to caller). */
async function syncReviewGraphById(reviewId) {
  try {
    const review = await Review.findById(reviewId);
    if (!review) {
      return { synced: false, reason: "not_found" };
    }
    const result = await syncReviewToGraph(review);
    if (result && result.synced === false) {
      incrementGraphSyncFailures();
    }
    return result;
  } catch (err) {
    logger.warn("graph", "syncReviewGraphById failed", {
      reviewId: String(reviewId),
      error: err.message,
    });
    incrementGraphSyncFailures();
    return { synced: false, reason: err.message };
  }
}

/** Schedule graph sync without blocking the HTTP response (async side effect). */
function scheduleGraphSync(reviewId) {
  syncReviewGraphById(reviewId).catch((err) => {
    incrementGraphSyncFailures();
    logger.warn("graph", "background sync failed", {
      reviewId: String(reviewId),
      error: err.message,
    });
  });
}

module.exports = { syncReviewGraphById, scheduleGraphSync };
