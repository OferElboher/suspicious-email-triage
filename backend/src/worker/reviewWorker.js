/**
 * This file starts a BullMQ worker process for the optional legacy Node scoring path.
 *
 * It is used only when the docker compose legacy-bullmq profile is enabled instead of relying on Python Celery.
 *
 * The worker connects to Redis, pulls analyze jobs, and delegates to processReviewJob.js.
 *
 * New deployments should prefer Kafka plus ai-celery; this file remains for backward compatibility.
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
