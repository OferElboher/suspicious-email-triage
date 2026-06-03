/**
 * Fire-and-forget Elasticsearch indexing for reviews (mirrors graph sync pattern).
 */
const Review = require("../models/Review");
const { indexReviewDocument } = require("../search/reviewSearchIndex");
const logger = require("../lib/logger");

/** Load review from Mongo and upsert into Elasticsearch (never throws to caller). */
async function syncReviewSearchById(reviewId) {
  try {
    const review = await Review.findById(reviewId);
    if (!review) {
      return { indexed: false, reason: "not_found" };
    }
    return await indexReviewDocument(review);
  } catch (err) {
    logger.warn("search", "syncReviewSearchById failed", {
      reviewId: String(reviewId),
      error: err.message,
    });
    return { indexed: false, reason: err.message };
  }
}

/** Schedule search index update without blocking HTTP response. */
function scheduleSearchIndex(reviewId) {
  syncReviewSearchById(reviewId).catch((err) => {
    logger.warn("search", "background index failed", {
      reviewId: String(reviewId),
      error: err.message,
    });
  });
}

module.exports = { syncReviewSearchById, scheduleSearchIndex };
