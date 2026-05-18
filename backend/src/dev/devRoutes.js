/**
 * Dev-only HTTP surface for simulation controls and capability advertisement to the SPA.
 * Non-dev deployments return 403 so staging/prod UIs cannot toggle load generators accidentally.
 */
const express = require("express");
const { Kafka, logLevel } = require("kafkajs");
const Review = require("../models/Review");
const logger = require("../lib/logger");
const { getRedis } = require("../lib/getRedis");
const {
  isDevDeployment,
  kafkaBrokers,
  kafkaTopicIngest,
} = require("../config/runtime");
const { resetStats } = require("../stats/statsPg");
const { writeSimulation, readSimulation, MAX_EVENTS_PER_MIN } = require("./simulationStore");
const { applySimulationFromStore, clearLoop } = require("./simulationLoop");

/** router: dev-only Express routes mounted at /dev. */
const router = express.Router();

/** resetKafkaTopic clears local dev Kafka backlog by recreating the ingest topic. */
async function resetKafkaTopic() {
  const kafka = new Kafka({
    clientId: "triage-dev-reset",
    brokers: kafkaBrokers(),
    logLevel: logLevel.NOTHING,
  });
  const admin = kafka.admin();
  await admin.connect();
  try {
    const topics = await admin.listTopics();
    if (topics.includes(kafkaTopicIngest)) {
      await admin.deleteTopics({ topics: [kafkaTopicIngest] });
    }
    await admin.createTopics({
      waitForLeaders: true,
      topics: [{ topic: kafkaTopicIngest, numPartitions: 1, replicationFactor: 1 }],
    });
  } finally {
    await admin.disconnect();
  }
}

/** GET /dev/features — tells the SPA which optional panels to render (no secrets). */
router.get("/features", (req, res) => {
  res.json({
    deployment: isDevDeployment() ? "dev" : "non-dev",
    simulation: isDevDeployment(),
    analytics: true,
    resetLocalState: isDevDeployment(),
    simulationMaxEventsPerMin: MAX_EVENTS_PER_MIN,
  });
});

/** Dev guard: all mutating /dev routes after this point are disabled outside dev. */
router.use((req, res, next) => {
  if (!isDevDeployment()) {
    return res.status(403).json({ error: "dev_only" });
  }
  return next();
});

/** POST /dev/simulation { enabled, eventsPerMinute } — updates Redis and restarts the loop. */
router.post("/simulation", async (req, res) => {
  try {
    const saved = await writeSimulation({
      enabled: req.body.enabled,
      eventsPerMinute: req.body.eventsPerMinute,
    });
    await applySimulationFromStore();
    logger.info("dev", "simulation updated", saved);
    res.json({ ok: true, simulation: saved });
  } catch (err) {
    logger.error("dev", "simulation update failed", { error: err.message });
    res.status(500).json({ error: "simulation_failed" });
  }
});

/** GET /dev/simulation — read current simulation settings from Redis. */
router.get("/simulation", async (req, res) => {
  try {
    const simulation = await readSimulation();
    res.json({ simulation });
  } catch (err) {
    logger.error("dev", "simulation read failed", { error: err.message });
    res.status(500).json({ error: "simulation_failed" });
  }
});

/** POST /dev/reset-local-state — clears local DBs/queues and disables simulation. */
router.post("/reset-local-state", async (req, res) => {
  const summary = {
    simulation: "disabled",
    mongoReviewsDeleted: 0,
    postgresStats: "pending",
    redis: "pending",
    kafka: "pending",
  };

  try {
    clearLoop();
    await writeSimulation({ enabled: false, eventsPerMinute: 1 });

    const mongoResult = await Review.deleteMany({});
    summary.mongoReviewsDeleted = mongoResult.deletedCount || 0;

    await resetStats();
    summary.postgresStats = "cleared";

    await getRedis().flushall();
    summary.redis = "flushed";

    try {
      await resetKafkaTopic();
      summary.kafka = "topic_recreated";
    } catch (err) {
      summary.kafka = "reset_failed";
      logger.warn("dev", "kafka reset failed", { error: err.message });
    }

    logger.warn("dev", "local state reset", summary);
    res.json({ ok: true, summary });
  } catch (err) {
    logger.error("dev", "local state reset failed", { error: err.message });
    res.status(500).json({ error: "reset_failed", summary });
  }
});

module.exports = router;
