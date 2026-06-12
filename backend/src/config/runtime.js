/**
 * Central runtime configuration loaded from process.env and backend/.env.<slice>.
 * deploymentEnv: dev | staging | prod — defaults to dev so local workstations behave predictably.
 * NODE_ENV: standard Node lifecycle hint (development vs production optimizations).
 *
 * Credentials (passwords, API keys, JWT signing keys) live in gitignored *.secrets files
 * loaded by backend/src/secrets — never in committed .env.dev / .env.staging / .env.prod.
 */
const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const { loadApplicationSecretsSync } = require("../secrets/loadSecrets");

/**
 * DEPLOYMENT_ENV / APP_ENV from the real shell selects which env file is loaded.
 * If nothing is provided, dev is used so local setup remains frictionless.
 */
const selectedDeploymentEnv = (
  process.env.DEPLOYMENT_ENV ||
  process.env.APP_ENV ||
  "dev"
).toLowerCase();

/** CI and Jest use committed fake secrets only — never real staging/prod credentials. */
if (process.env.JEST_WORKER_ID || process.env.NODE_ENV === "test") {
  process.env.SECRETS_PROVIDER = process.env.SECRETS_PROVIDER || "file";
  if (!process.env.SECRETS_FILE) {
    process.env.SECRETS_FILE = path.resolve(__dirname, "../../ci.secrets");
  }
}

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

/** Load non-sensitive profile first; shell exports win over file values (override: false). */
dotenv.config({ path: selectedEnvFile, override: false, quiet: true });

/**
 * Inject gitignored secrets when not preloaded by Docker entrypoint (local npm test / scripts).
 * SECRETS_PRELOAD=1 means docker-entrypoint-with-secrets.sh already fetched from mock AWS.
 */
if (process.env.SECRETS_PRELOAD !== "1") {
  loadApplicationSecretsSync(selectedDeploymentEnv);
}

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

/** Dead-letter topic for poison / invalid ingest messages (reliability demo). */
const kafkaTopicDlq =
  process.env.KAFKA_TOPIC_REVIEW_DLQ || "email.review.ingested.dlq";

/** Partition count for ingest topic (consumer-group demo in dev). */
function kafkaTopicPartitions() {
  return Number(process.env.KAFKA_TOPIC_PARTITIONS || 3);
}

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
  kafkaTopicDlq,
  kafkaTopicPartitions,
  useKafkaIngest,
  useBullEnqueue,
  port,
  selectedEnvFile,
};
