/**
 * HTTP client for the Go ingest-gateway service (server-side proxy for the React UI).
 *
 * Pattern: Node proxies gateway stats so the browser keeps using JWT auth + CRA proxy
 * instead of calling the Go container directly from the browser.
 */
const logger = require("../lib/logger");

/** Resolve base URL for the Go ingest-gateway container. */
function ingestGatewayBaseUrl() {
  return (process.env.INGEST_GATEWAY_URL || "http://ingest-gateway:8080").replace(/\/$/, "");
}

/** Return true when mailbox ingest feature is enabled in this deployment profile. */
function isMailboxIngestEnabled() {
  const flag = String(process.env.MAILBOX_INGEST_ENABLED || "true").toLowerCase();
  return flag === "true" || flag === "1";
}

/**
 * Fetch JSON from the Go gateway with a short timeout.
 * @param {string} path - e.g. /v1/stats/dashboard
 * @param {RequestInit} [init]
 * @returns {Promise<object>}
 */
async function fetchGatewayJson(path, init = {}) {
  const url = `${ingestGatewayBaseUrl()}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }
    if (!response.ok) {
      const err = new Error(`ingest-gateway ${response.status}`);
      err.status = response.status;
      err.body = body;
      throw err;
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * GET /v1/stats/dashboard proxy — live ingest counters for React charts.
 * @returns {Promise<object>}
 */
async function getMailboxIngestDashboard() {
  if (!isMailboxIngestEnabled()) {
    return { enabled: false, reason: "mailbox_ingest_disabled" };
  }
  try {
    const snapshot = await fetchGatewayJson("/v1/stats/dashboard");
    return { enabled: true, ...snapshot };
  } catch (err) {
    logger.warn("ingest", "gateway dashboard fetch failed", { error: err.message });
    return { enabled: true, reachable: false, error: err.message };
  }
}

/**
 * POST simulation control to Go gateway (dev only).
 * @param {"start"|"stop"} action
 * @param {{ emailsPerMinute?: number }} [options]
 */
async function postMailboxSimulation(action, options = {}) {
  if (action === "start") {
    return fetchGatewayJson("/v1/simulation/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emailsPerMinute: options.emailsPerMinute || 1 }),
    });
  }
  return fetchGatewayJson("/v1/simulation/stop", { method: "POST" });
}

/**
 * GET simulation status from Go gateway.
 * @returns {Promise<object>}
 */
async function getMailboxSimulationStatus() {
  return fetchGatewayJson("/v1/simulation/status");
}

module.exports = {
  ingestGatewayBaseUrl,
  isMailboxIngestEnabled,
  getMailboxIngestDashboard,
  postMailboxSimulation,
  getMailboxSimulationStatus,
};
