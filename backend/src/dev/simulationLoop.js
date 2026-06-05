/**
 * Dev-only background timer: creates synthetic reviews at a capped rate to exercise Kafka/Celery.
 * Started from server.js after HTTP listen; re-reads Redis when applySimulationFromStore is called.
 */
const Review = require("../models/Review");
const logger = require("../lib/logger");
const { isDevDeployment } = require("../config/runtime");
const { enqueueAfterCreate } = require("../services/reviewPipeline");
const { readSimulation } = require("./simulationStore");

let timer = null;

/** Clears any running interval timer (idempotent). */
function clearLoop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * Applies current Redis simulation settings to the in-process interval loop.
 * Safe to call repeatedly (POST /dev/simulation and startup hydration).
 */
async function applySimulationFromStore() {
  clearLoop();
  if (!isDevDeployment()) {
    return;
  }
  const cfg = await readSimulation();
  if (!cfg.enabled) {
    logger.info("simulation", "disabled", {});
    return;
  }
  const perMin = Math.max(cfg.eventsPerMinute, 1);
  const ms = Math.max(Math.round(60000 / perMin), 2000);
  timer = setInterval(() => {
    tick().catch((err) =>
      logger.warn("simulation", "tick failed", { error: err.message })
    );
  }, ms);
  logger.info("simulation", "enabled", { eventsPerMinute: perMin, intervalMs: ms });
}

/** One synthetic ingest: persists a Review and enqueues the async pipeline like a real user. */
async function tick() {
  const n = Date.now();
  const review = await Review.create({
    senderName: "Simulator",
    senderEmail: `sim+${n}@dev.local`,
    subject: `Simulated ingest ${new Date(n).toISOString()}`,
    body: "Synthetic message for throughput testing in development.",
    links: [],
    referenceSources: [],
    source: "dev_simulation",
    status: "pending",
  });
  await enqueueAfterCreate(review._id);
  logger.info("simulation", "synthetic review", { id: String(review._id) });
}

module.exports = { applySimulationFromStore, clearLoop };
