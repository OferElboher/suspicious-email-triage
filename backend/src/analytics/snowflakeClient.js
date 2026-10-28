/**
 * This module is the HTTP client for pushing analytical rows and fetching reporting aggregates from a warehouse-compatible API.
 *
 * The URL comes from SNOWFLAKE_URL—mock-snowflake in dev, a real Snowflake proxy or partner API in staging/production.
 *
 * It implements the small REST contract our product needs (insert row, query verdict distribution, etc.) rather than speaking raw Snowflake SQL from Node.
 *
 * snowflakeExport.js and analytics API routes call these functions after reviews complete or analysts override verdicts.
 */
const logger = require("../lib/logger");

/** Cached base URL resolved once from environment. */
let resolvedBaseUrl = null;

/** True when analytical export features should run. */
function isSnowflakeEnabled() {
  const flag = String(process.env.SNOWFLAKE_ENABLED || "true").toLowerCase();
  return flag !== "false" && flag !== "0";
}

/** Base URL for mock Snowflake (Compose service) or real Snowflake proxy. */
function snowflakeBaseUrl() {
  if (resolvedBaseUrl) {
    return resolvedBaseUrl;
  }
  resolvedBaseUrl =
    process.env.SNOWFLAKE_URL ||
    process.env.SNOWFLAKE_MOCK_URL ||
    "http://mock-snowflake:4567";
  return resolvedBaseUrl;
}

/** Reset cached URL — used in tests when env changes between cases. */
function resetSnowflakeClient() {
  resolvedBaseUrl = null;
}

/** Perform JSON HTTP call against Snowflake mock/real endpoint. */
async function snowflakeRequest(path, { method = "GET", body = null } = {}) {
  if (!isSnowflakeEnabled()) {
    return { ok: false, disabled: true };
  }
  const url = `${snowflakeBaseUrl().replace(/\/$/, "")}${path}`;
  try {
    const response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      logger.warn("snowflake", "request failed", { path, status: response.status, payload });
      return { ok: false, status: response.status, ...payload };
    }
    return { ok: true, ...payload };
  } catch (err) {
    logger.warn("snowflake", "unreachable", { path, error: err.message });
    return { ok: false, unreachable: true, error: err.message };
  }
}

/** Insert or upsert analytical rows into a named Snowflake table. */
async function insertRows(table, rows) {
  return snowflakeRequest("/v1/data/insert", { method: "POST", body: { table, rows } });
}

/** Clear all mock warehouse tables (dev reset only). */
async function clearAnalyticsTables() {
  return snowflakeRequest("/v1/data/clear", { method: "POST", body: {} });
}

/** Cluster status and row counts from mock/real warehouse. */
async function getWarehouseStatus() {
  return snowflakeRequest("/v1/status");
}

module.exports = {
  isSnowflakeEnabled,
  snowflakeBaseUrl,
  resetSnowflakeClient,
  snowflakeRequest,
  insertRows,
  clearAnalyticsTables,
  getWarehouseStatus,
};
