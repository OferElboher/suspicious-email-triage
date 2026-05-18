/**
 * Central runtime configuration loaded from process.env and backend/.env.<slice>.
 * deploymentEnv: dev | staging | prod — defaults to dev so local workstations behave predictably.
 * NODE_ENV: standard Node lifecycle hint (development vs production optimizations).
 */
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");

/**
 * DEPLOYMENT_ENV / APP_ENV from the real shell selects which env file is loaded.
 * If nothing is provided, dev is used so local setup remains frictionless.
 */
const selectedDeploymentEnv = (
  process.env.DEPLOYMENT_ENV ||
  process.env.APP_ENV ||
  "dev"
).toLowerCase();

/**
 * defaultEnvFile lets a local backend/.env copy act as the active profile when present.
 * If it does not exist, backend/.env.dev is the safe default.
 */
const defaultEnvFile = path.resolve(__dirname, "../../.env");

/** selectEnvFile chooses the env profile without hiding shell-provided values. */
function selectEnvFile() {
  if (process.env.ENV_FILE) {
    return process.env.ENV_FILE;
  }

  if (process.env.DEPLOYMENT_ENV || process.env.APP_ENV) {
    return path.resolve(__dirname, `../../.env.${selectedDeploymentEnv}`);
  }

  if (fs.existsSync(defaultEnvFile)) {
    return defaultEnvFile;
  }

  return path.resolve(__dirname, "../../.env.dev");
}

/** selectedEnvFile records which profile was loaded for diagnostics/tests. */
const selectedEnvFile = selectEnvFile();

/** Load the selected environment file before exporting runtime helpers. */
dotenv.config({ path: selectedEnvFile, override: false, quiet: true });

/** NODE_ENV: Node’s conventional mode; affects libraries that branch on “production”. */
const env = process.env.NODE_ENV || "development";

/**
 * DEPLOYMENT_ENV / APP_ENV: product slice (dev vs staging vs prod).
 * Dev unlocks simulation controls and relaxed defaults in the API layer.
 */
function deploymentEnv() {
  return (
    process.env.DEPLOYMENT_ENV ||
    process.env.APP_ENV ||
    selectedDeploymentEnv
  ).toLowerCase();
}

/** True when running the “dev” deployment slice (simulation UI, dev-only routes). */
function isDevDeployment() {
  return deploymentEnv() === "dev";
}

/** Mongo connection string; MONGO_URI wins, else host/port/db parts are composed. */
function mongoUri() {
  return (
    process.env.MONGO_URI ||
    `mongodb://${process.env.MONGO_HOST || "localhost"}:${
      process.env.MONGO_PORT || "27017"
    }/${process.env.MONGO_DB || "triage"}`
  );
}

/** PostgreSQL URL for narrow chart/statistics events; dev uses local Compose postgres. */
function statsPgUrl() {
  return (
    process.env.STATISTICS_PG_URL ||
    process.env.DATABASE_URL ||
    "postgres://triage:triage@localhost:5432/triage_stats"
  );
}

/** Redis connection options shared by BullMQ, cache keys, and dev-simulation state. */
function redisOptions() {
  return {
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT || 6379),
    maxRetriesPerRequest: null,
  };
}

/** KAFKA_BROKERS: comma-separated host:port list for the ingest producer and Python dispatcher. */
function kafkaBrokers() {
  const raw = process.env.KAFKA_BROKERS || "localhost:9092";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/** Kafka topic name for “review created” events consumed into Celery. */
const kafkaTopicIngest =
  process.env.KAFKA_TOPIC_REVIEW_INGEST || "email.review.ingested";

/** USE_KAFKA_INGEST: when true, API publishes after each persisted review (primary async path). */
function useKafkaIngest() {
  return String(process.env.USE_KAFKA_INGEST || "true").toLowerCase() === "true";
}

/** USE_BULLMQ_ENQUEUE: legacy Redis queue path from the API (optional fallback). */
function useBullEnqueue() {
  return String(process.env.USE_BULLMQ_ENQUEUE || "false").toLowerCase() === "true";
}

/** PORT: HTTP listen port for the Express API container or local process. */
const port = Number(process.env.PORT || 3000);

module.exports = {
  env,
  deploymentEnv,
  isDevDeployment,
  mongoUri,
  statsPgUrl,
  redisOptions,
  kafkaBrokers,
  kafkaTopicIngest,
  useKafkaIngest,
  useBullEnqueue,
  port,
  selectedEnvFile,
};
