/**
 * HTTP server entry: env, mongo, express listen.
 * Pipeline default: Kafka ingest → Python Celery; optional BullMQ worker for legacy/fallback.
 */
const { createApp } = require("./http/createApp");
const { connectMongo } = require("./lib/mongoConnect");
const logger = require("./lib/logger");
const { port } = require("./config/runtime");
const { applySimulationFromStore } = require("./dev/simulationLoop");
const { ensureStatsSchema } = require("./stats/statsPg");

async function main() {
  await connectMongo();
  /** Initialize PostgreSQL stats schema early so chart routes are ready. */
  await ensureStatsSchema();
  const app = createApp();
  app.listen(port, async () => {
    logger.info("http", `listening on ${port}`, {});
    await applySimulationFromStore();
  });
}

main().catch((err) => {
  logger.critical("http", "fatal startup", { error: err.message });
  process.exit(1);
});
