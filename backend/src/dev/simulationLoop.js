/**
 * In-process dev simulation timer — synthetic Review documents at a Redis-configured rate.
 *
 * Pattern: setInterval inside the Node API process (not Celery); each tick creates a Mongo
 * review with source:dev_simulation and calls enqueueAfterCreate (Kafka ingest).
 * State: simulationStore.js (Redis); toggled via POST /dev/simulation from SimulationPanel.jsx.
 */
const Review = require("../models/Review");
const logger = require("../lib/logger");
const { extractLinks } = require("../lib/extractLinks");
const { incrementReviewsCreated } = require("../lib/appMetrics");
const { isDevDeployment } = require("../config/runtime");
const { enqueueAfterCreate } = require("../services/reviewPipeline");
const { readSimulation } = require("./simulationStore");
const {
  pickPhishingSimulationTemplate,
  simulationCorrelationIds,
} = require("../lib/phishingSimulationTemplates");

/** Monotonic sequence for round-robin phishing demo templates. */
let simulationSeq = 0;

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
  simulationSeq += 1;
  const template = pickPhishingSimulationTemplate(simulationSeq);
  const { senderEmail, externalMessageId } = simulationCorrelationIds(template, simulationSeq);
  const review = await Review.create({
    senderName: template.senderName,
    senderEmail,
    subject: `${template.subject} (#${simulationSeq})`,
    body: template.body,
    links: extractLinks(template.body),
    referenceSources: [],
    source: "dev_simulation",
    externalMessageId,
    status: "pending",
  });
  await enqueueAfterCreate(review._id);
  incrementReviewsCreated();
  logger.info("simulation", "synthetic review", {
    id: String(review._id),
    templateId: template.id,
    expectedVerdict: template.expectedVerdict,
  });
}

module.exports = { applySimulationFromStore, clearLoop };
