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
const {
  ensureAuthSchema,
  seedRolesAndPermissions,
  bootstrapAdminUser,
} = require("./auth/authPg");

async function main() {
  /** PostgreSQL schemas first so auth/stats exist even if Mongo is temporarily unavailable. */
  await ensureStatsSchema();
  await ensureAuthSchema();
  await seedRolesAndPermissions();
  await bootstrapAdminUser();

  await connectMongo();
  const app = createApp();
  app.listen(port, async () => {
    logger.info("http", `listening on ${port}`, {});
    await applySimulationFromStore();
  });
}

main().catch((err) => {
  logger.critical("http", "fatal startup", { error: err.message, stack: err.stack });
  console.error(err);
  process.exit(1);
});
