/**
 * This module is the single post-save hook used whenever a Review document already exists in MongoDB.
 *
 * Its exported function enqueueAfterCreate(reviewId) records review_created and initial status_changed statistics in PostgreSQL, then publishes the review id to Kafka for asynchronous Python scoring.
 *
 * Manual triage (POST /reviews), Go mailbox ingest (internal route), and the dev simulation loop all call this function so behavior does not depend on which UI or gateway created the review.
 *
 * If Kafka is unavailable and BullMQ enqueue is turned on, it queues a legacy Node worker job as a degraded fallback.
 */
const logger = require("../lib/logger");
const reviewQueue = require("../queue/reviewQueue");
const { publishReviewIngested } = require("../kafka/reviewIngestProducer");
const { useKafkaIngest, useBullEnqueue } = require("../config/runtime");
const { recordStatsEvent } = require("../stats/statsPg");

/**
 * Pushes a persisted review into the async pipeline.
 * @param {import("mongoose").Types.ObjectId|string} reviewId
 */
async function enqueueAfterCreate(reviewId) {
  const id = reviewId.toString();
  /** Record chart stats in PostgreSQL before queueing; Mongo remains the review store. */
  await recordStatsEvent({
    eventType: "review_created",
    status: "pending",
    reviewId: id,
  });
  /** Also record the initial status transition used by status breakdown charts. */
  await recordStatsEvent({
    eventType: "status_changed",
    status: "pending",
    reviewId: id,
  });
  if (useKafkaIngest()) {
    try {
      await publishReviewIngested(id);
      return;
    } catch (err) {
      logger.warn("pipeline", "kafka publish failed", {
        reviewId: id,
        error: err.message,
      });
      if (useBullEnqueue()) {
        await reviewQueue.add("analyze", { reviewId: id });
      }
    }
    return;
  }
  if (useBullEnqueue()) {
    await reviewQueue.add("analyze", { reviewId: id });
  }
}

module.exports = { enqueueAfterCreate };
