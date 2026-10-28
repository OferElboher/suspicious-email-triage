/**
 * This file is the Node.js process entry point for the triage API container.
 *
 * It connects to MongoDB, ensures PostgreSQL auth and statistics schemas exist, builds the Express application from createApp.js, and starts listening on the configured PORT.
 *
 * After the HTTP server is accepting traffic, it loads dev simulation settings from Redis and may start the synthetic review timer so dashboards can be tested without manual submissions.
 *
 * Operators and developers start this file directly in local Node runs; in Docker the backend container typically runs preload-secrets.js first, which then requires this module.
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
