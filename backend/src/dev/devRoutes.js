/**
 * Dev-only HTTP surface for simulation controls and capability advertisement to the SPA.
 * Requires developer role permissions; mutating routes also require dev deployment slice.
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
  kafkaTopicDlq,
  kafkaTopicPartitions,
} = require("../config/runtime");
const { resetStats } = require("../stats/statsPg");
const { resetGraph } = require("../graph/neo4jClient");
const { pruneOrphanGraphNodes } = require("../graph/graphMaintenance");
const { writeSimulation, readSimulation, MAX_EVENTS_PER_MIN } = require("./simulationStore");
const { applySimulationFromStore, clearLoop } = require("./simulationLoop");
const { requirePermission, hasPermission } = require("../http/middleware/auth");

/** router: dev-only Express routes mounted at /dev. */
const router = express.Router();

/** resetKafkaTopic clears local dev Kafka backlog by recreating ingest + DLQ topics. */
async function resetKafkaTopic() {
  const kafka = new Kafka({
    clientId: "triage-dev-reset",
    brokers: kafkaBrokers(),
    logLevel: logLevel.NOTHING,
  });
  const admin = kafka.admin();
  await admin.connect();
  const partitions = kafkaTopicPartitions();
  try {
    const topics = await admin.listTopics();
    const toDelete = [kafkaTopicIngest, kafkaTopicDlq].filter((t) => topics.includes(t));
    if (toDelete.length) {
      await admin.deleteTopics({ topics: toDelete });
    }
    await admin.createTopics({
      waitForLeaders: true,
      topics: [
        { topic: kafkaTopicIngest, numPartitions: partitions, replicationFactor: 1 },
        { topic: kafkaTopicDlq, numPartitions: 1, replicationFactor: 1 },
      ],
    });
  } finally {
    await admin.disconnect();
  }
}

/** GET /dev/features — tells the SPA which optional panels to render for this user. */
router.get("/features", (req, res) => {
  const devEnv = isDevDeployment();
  const canSimulate =
    devEnv && hasPermission(req.auth, "dev.simulation") && req.auth.roles.includes("developer");
  const canReset =
    devEnv && hasPermission(req.auth, "dev.reset") && req.auth.roles.includes("developer");
  res.json({
    deployment: devEnv ? "dev" : "non-dev",
    simulation: canSimulate,
    analytics: hasPermission(req.auth, "metrics.read"),
    resetLocalState: canReset,
    simulationMaxEventsPerMin: MAX_EVENTS_PER_MIN,
    roles: req.auth.roles,
    permissions: req.auth.permissions,
  });
});

/** Dev guard: mutating /dev routes require dev deployment slice. */
router.use((req, res, next) => {
  if (!isDevDeployment()) {
    return res.status(403).json({ error: "dev_only" });
  }
  return next();
});

/** POST /dev/simulation { enabled, eventsPerMinute } — updates Redis and restarts the loop. */
router.post("/simulation", requirePermission("dev.simulation"), async (req, res) => {
  if (!req.auth.roles.includes("developer")) {
    return res.status(403).json({ error: "developer_role_required" });
  }
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
router.get("/simulation", requirePermission("dev.simulation"), async (req, res) => {
  if (!req.auth.roles.includes("developer")) {
    return res.status(403).json({ error: "developer_role_required" });
  }
  try {
    const simulation = await readSimulation();
    res.json({ simulation });
  } catch (err) {
    logger.error("dev", "simulation read failed", { error: err.message });
    res.status(500).json({ error: "simulation_failed" });
  }
});

/** POST /dev/prune-graph — delete orphan Neo4j nodes (stale Url/Domain debris from old sync code). */
router.post("/prune-graph", requirePermission("dev.reset"), async (req, res) => {
  if (!req.auth.roles.includes("developer")) {
    return res.status(403).json({ error: "developer_role_required" });
  }
  try {
    const result = await pruneOrphanGraphNodes();
    res.json({ ok: true, ...result });
  } catch (err) {
    logger.error("dev", "neo4j prune failed", { error: err.message });
    res.status(500).json({ error: "neo4j_prune_failed" });
  }
});

/** POST /dev/reset-local-state — clears local DBs/queues and disables simulation. */
router.post("/reset-local-state", requirePermission("dev.reset"), async (req, res) => {
  if (!req.auth.roles.includes("developer")) {
    return res.status(403).json({ error: "developer_role_required" });
  }
  const summary = {
    simulation: "disabled",
    mongoReviewsDeleted: 0,
    postgresStats: "pending",
    redis: "pending",
    kafka: "pending",
    neo4j: "pending",
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

    try {
      const cleared = await resetGraph();
      summary.neo4j = cleared ? "cleared" : "disabled_or_unavailable";
    } catch (err) {
      summary.neo4j = "reset_failed";
      logger.warn("dev", "neo4j reset failed", { error: err.message });
    }

    logger.warn("dev", "local state reset", summary);
    res.json({ ok: true, summary });
  } catch (err) {
    logger.error("dev", "local state reset failed", { error: err.message });
    res.status(500).json({ error: "reset_failed", summary });
  }
});

module.exports = router;
