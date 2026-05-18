/**
 * Singleton IORedis client for lightweight key/value (simulation flags, counters).
 * Separate from BullMQ’s dedicated connection to avoid interfering with blocking commands.
 */
const IORedis = require("ioredis");
const { redisOptions } = require("../config/runtime");

let client;

/** Returns a shared Redis client; lazily constructed on first use. */
function getRedis() {
  if (!client) {
    client = new IORedis({
      ...redisOptions(),
      maxRetriesPerRequest: 20,
    });
  }
  return client;
}

module.exports = { getRedis };
