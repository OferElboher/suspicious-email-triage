/**
 * This service updates or deletes Elasticsearch documents when reviews change in MongoDB.
 *
 * Celery or Node hooks call it after scoring completes so new reviews appear in search without manual reindex.
 *
 * Failures log warnings but do not block review completion.
 *
 * Decoupling sync from API handlers avoids slowing POST /reviews responses.
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
