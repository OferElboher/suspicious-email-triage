/**
 * Lazy Neo4j driver singleton.
 * When NEO4J_ENABLED=false the graph layer returns empty results instead of throwing.
 */
const neo4j = require("neo4j-driver");
const logger = require("../lib/logger");

/** Cached driver instance created on first successful connect. */
let driver = null;

/** True when graph writes/queries should run (env toggle for CI without Neo4j). */
function isNeo4jEnabled() {
  const flag = String(process.env.NEO4J_ENABLED || "true").toLowerCase();
  return flag !== "false" && flag !== "0";
}

/** Build Bolt URI + credentials from environment with dev-friendly defaults. */
function buildDriverConfig() {
  return {
    uri: process.env.NEO4J_URI || "bolt://neo4j:7687",
    user: process.env.NEO4J_USER || "neo4j",
    password: process.env.NEO4J_PASSWORD || "triage-neo4j-dev",
  };
}

/** Return a connected driver or null when disabled/unreachable (graceful degradation). */
async function getDriver() {
  if (!isNeo4jEnabled()) {
    return null;
  }
  if (driver) {
    return driver;
  }
  const { uri, user, password } = buildDriverConfig();
  try {
    driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
    await driver.verifyConnectivity();
    logger.info("neo4j", "connected", { uri });
    return driver;
  } catch (err) {
    logger.warn("neo4j", "connect failed — graph features degraded", { error: err.message });
    try {
      if (driver) {
        await driver.close();
      }
    } catch (_closeErr) {
      /* ignore close errors during failed bootstrap */
    }
    driver = null;
    return null;
  }
}

/** Convert plain JS numbers to neo4j-driver Integer types (LIMIT rejects 50.0 floats). */
function toNeo4jParams(params = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      normalized[key] = neo4j.int(Math.trunc(value));
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}

/** Run a read transaction; returns records array or [] when Neo4j is unavailable. */
async function runRead(cypher, params = {}) {
  const active = await getDriver();
  if (!active) {
    return [];
  }
  const session = active.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.executeRead((tx) => tx.run(cypher, toNeo4jParams(params)));
    return result.records;
  } catch (err) {
    logger.error("neo4j", "read query failed", { error: err.message });
    throw err;
  } finally {
    await session.close();
  }
}

/** Run a write transaction; no-op when Neo4j is unavailable. */
async function runWrite(cypher, params = {}) {
  const active = await getDriver();
  if (!active) {
    return null;
  }
  const session = active.session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    return await session.executeWrite((tx) => tx.run(cypher, toNeo4jParams(params)));
  } catch (err) {
    logger.error("neo4j", "write query failed", { error: err.message });
    throw err;
  } finally {
    await session.close();
  }
}

/** Close driver — used in tests and graceful shutdown hooks. */
async function closeDriver() {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

/** Delete all graph nodes — used by dev reset only. */
async function resetGraph() {
  if (!isNeo4jEnabled()) {
    return false;
  }
  await runWrite("MATCH (n) DETACH DELETE n");
  return true;
}

module.exports = {
  isNeo4jEnabled,
  getDriver,
  runRead,
  runWrite,
  closeDriver,
  resetGraph,
  toNeo4jParams,
};
