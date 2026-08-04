/**
 * Kafka producer for email.review.completed — mail adapters consume verdict-ready events.
 *
 * Pattern: optional second topic after webhook delivery succeeds (event-driven integration).
 * Technology: KafkaJS (same client as reviewIngestProducer.js).
 */
const { Kafka, logLevel } = require("kafkajs");
const logger = require("../lib/logger");
const { kafkaBrokers } = require("../config/runtime");

/** Topic name — overridable for multi-env clusters. */
const kafkaTopicCompleted =
  process.env.KAFKA_TOPIC_REVIEW_COMPLETED || "email.review.completed";

let producerPromise;

/** Lazily connect singleton producer (separate from ingest producer for isolation). */
async function getProducer() {
  if (producerPromise) {
    return producerPromise;
  }
  const kafka = new Kafka({
    clientId: "triage-api-completed",
    brokers: kafkaBrokers(),
    logLevel: logLevel.NOTHING,
  });
  const producer = kafka.producer();
  producerPromise = producer.connect().then(() => producer);
  return producerPromise;
}

/**
 * Publish verdict-ready event after successful webhook (or for event-only integrations).
 * @param {string} reviewId
 * @param {object} payload — buildVerdictPayload shape
 */
async function publishReviewCompleted(reviewId, payload) {
  if (String(process.env.VERDICT_KAFKA_COMPLETED || "true").toLowerCase() === "false") {
    return;
  }
  const message = JSON.stringify({
    reviewId: String(reviewId),
    at: new Date().toISOString(),
    ...payload,
  });
  try {
    const producer = await getProducer();
    await producer.send({
      topic: kafkaTopicCompleted,
      messages: [{ key: String(reviewId), value: message }],
    });
    logger.info("kafka", "review completed message sent", { reviewId });
  } catch (err) {
    logger.error("kafka", "completed publish failed", {
      reviewId,
      error: err.message,
    });
    throw err;
  }
}

/** Disconnect for tests / graceful shutdown. */
async function disconnectCompletedProducer() {
  if (!producerPromise) {
    return;
  }
  try {
    const p = await producerPromise;
    await p.disconnect();
  } catch (err) {
    logger.warn("kafka", "completed disconnect failed", { error: err.message });
  } finally {
    producerPromise = null;
  }
}

module.exports = {
  publishReviewCompleted,
  disconnectCompletedProducer,
  kafkaTopicCompleted,
};
