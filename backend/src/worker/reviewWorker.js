/**
 * Redis BullMQ consumer (legacy path). Primary pipeline: Kafka → Celery (Python).
 */
const mongoose = require("mongoose");
const { Worker } = require("bullmq");
const IORedis = require("ioredis");
const logger = require("../lib/logger");
const { mongoUri, redisOptions } = require("../config/runtime");
const { processReviewJob } = require("./processReviewJob");

const connection = new IORedis(redisOptions());

mongoose
  .connect(mongoUri())
  .then(() => {
    logger.info("worker", "mongo connected", {});
    const worker = new Worker(
      "review-analysis",
      async (job) => processReviewJob(job.data.reviewId),
      { connection }
    );
    worker.on("failed", (job, err) => {
      logger.error("worker", "bullmq failed event", {
        id: job?.id,
        error: err.message,
      });
    });
  })
  .catch((err) => {
    logger.critical("worker", "mongo connect failed", { error: err.message });
    process.exit(1);
  });
