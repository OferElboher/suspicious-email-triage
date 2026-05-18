/**
 * Shared “after review persisted” side-effects: Kafka ingest (and optional BullMQ fallback).
 * Keeps POST /reviews, /test, and the dev simulator aligned on the same enqueue rules.
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
