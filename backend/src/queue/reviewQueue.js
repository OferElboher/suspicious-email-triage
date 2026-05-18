const { Queue } = require("bullmq");
const IORedis = require("ioredis");
const { redisOptions } = require("../config/runtime");

const connection = new IORedis({
  ...redisOptions(),
  maxRetriesPerRequest: null,
});

const reviewQueue = new Queue("review-analysis", { connection });

module.exports = reviewQueue;
