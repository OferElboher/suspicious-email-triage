/**
 * Fire-and-forget producer for review-ingest topic (Celery pipeline entry).
 * Uses reviewId as message key so all events for one review land in the same partition.
 */
const { Kafka, logLevel } = require("kafkajs");
const logger = require("../lib/logger");
const { kafkaBrokers, kafkaTopicIngest } = require("../config/runtime");

let producerPromise;

/** Lazily connect a singleton KafkaJS producer. */
async function getProducer() {
  if (producerPromise) return producerPromise;
  const kafka = new Kafka({
    clientId: "triage-api",
    brokers: kafkaBrokers(),
    logLevel: logLevel.NOTHING,
  });
  const producer = kafka.producer();
  producerPromise = producer.connect().then(() => producer);
  return producerPromise;
}

/** Publish a review-ingested event; key=reviewId for partition stickiness. */
async function publishReviewIngested(reviewId) {
  const payload = JSON.stringify({
    reviewId: String(reviewId),
    at: new Date().toISOString(),
  });
  try {
    const producer = await getProducer();
    await producer.send({
      topic: kafkaTopicIngest,
      messages: [{ key: String(reviewId), value: payload }],
    });
    logger.info("kafka", "review ingested message sent", { reviewId });
  } catch (err) {
    logger.error("kafka", "publish failed", {
      reviewId,
      error: err.message,
    });
    throw err;
  }
}

/** Disconnect producer on shutdown (tests / graceful exit). */
async function disconnectProducer() {
  if (!producerPromise) return;
  try {
    const p = await producerPromise;
    await p.disconnect();
  } catch (err) {
    logger.warn("kafka", "disconnect failed", { error: err.message });
  } finally {
    producerPromise = null;
  }
}

module.exports = { publishReviewIngested, disconnectProducer };
