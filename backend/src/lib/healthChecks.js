/**
 * Readiness probes for orchestrators (Docker HEALTHCHECK, Kubernetes readinessProbe).
 * Each check is optional — failure marks dependency unhealthy but returns structured JSON.
 */
const mongoose = require("mongoose");
const { Pool } = require("pg");
const { statsPgUrl } = require("../config/runtime");
const { isNeo4jEnabled, getDriver } = require("../graph/neo4jClient");

/** Shared Postgres pool for quick SELECT 1 probes (separate from auth pool). */
let probePool;

/** Lazy singleton probe pool so health checks do not open a connection per request. */
function getProbePool() {
  if (!probePool) {
    probePool = new Pool({ connectionString: statsPgUrl(), max: 2 });
  }
  return probePool;
}

/** Liveness: process is up (no external I/O). */
function livenessPayload() {
  return {
    status: "ok",
    probe: "live",
    service: "triage-api",
    timestamp: new Date().toISOString(),
  };
}

/** Ping MongoDB driver connection state. */
async function checkMongo() {
  const state = mongoose.connection.readyState;
  const ok = state === 1;
  return {
    name: "mongodb",
    ok,
    detail: ok ? "connected" : `readyState=${state}`,
  };
}

/** Ping PostgreSQL statistics database. */
async function checkPostgres() {
  try {
    await getProbePool().query("SELECT 1 AS ok");
    return { name: "postgres", ok: true, detail: "connected" };
  } catch (err) {
    return { name: "postgres", ok: false, detail: err.message };
  }
}

/** Optional Redis ping when REDIS_HOST is configured. */
async function checkRedis() {
  const host = process.env.REDIS_HOST;
  if (!host) {
    return { name: "redis", ok: true, detail: "skipped" };
  }
  try {
    const Redis = require("ioredis");
    const client = new Redis({
      host,
      port: Number(process.env.REDIS_PORT || 6379),
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    await client.connect();
    const pong = await client.ping();
    await client.quit();
    return { name: "redis", ok: pong === "PONG", detail: pong };
  } catch (err) {
    return { name: "redis", ok: false, detail: err.message };
  }
}

/** Optional Neo4j Bolt connectivity when graph features are enabled. */
async function checkNeo4j() {
  if (!isNeo4jEnabled()) {
    return { name: "neo4j", ok: true, detail: "disabled" };
  }
  try {
    const driver = await getDriver();
    if (!driver) {
      return { name: "neo4j", ok: false, detail: "unreachable" };
    }
    return { name: "neo4j", ok: true, detail: "connected" };
  } catch (err) {
    return { name: "neo4j", ok: false, detail: err.message };
  }
}

/** Aggregate readiness across dependencies used by the triage API path. */
async function readinessPayload() {
  const checks = await Promise.all([
    checkMongo(),
    checkPostgres(),
    checkRedis(),
    checkNeo4j(),
  ]);
  const ok = checks.every((c) => c.ok);
  return {
    status: ok ? "ok" : "degraded",
    probe: "ready",
    service: "triage-api",
    timestamp: new Date().toISOString(),
    checks,
  };
}

module.exports = { livenessPayload, readinessPayload };
