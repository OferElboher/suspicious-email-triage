/**
 * HTTP client for Snowflake analytics export (mock dev server or future real Snowflake SQL API).
 *
 * Pattern: singleton fetch client with graceful degradation when SNOWFLAKE_ENABLED=false.
 * Technology: Node fetch (Docker healthcheck pattern) against mock-aws-snowflake container.
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
