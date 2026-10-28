/**
 * This module creates the Elasticsearch client used for review full-text search.
 *
 * It reads cluster URL and index name from environment variables set in Compose for the elasticsearch service.
 *
 * Health of the cluster affects GET /search/status shown in dev admin panels.
 *
 * Single-node dev image differs from managed OpenSearch in production but API usage is the same.
 */
const { Client } = require("@elastic/elasticsearch");
const logger = require("../lib/logger");

/** Cached client instance after first successful connect. */
let client = null;

/** True when review search indexing should run. */
function isElasticsearchEnabled() {
  const flag = String(process.env.ELASTICSEARCH_ENABLED || "true").toLowerCase();
  return flag !== "false" && flag !== "0";
}

/** Build node URL list from ELASTICSEARCH_URL (comma-separated for future HA). */
function elasticsearchNodes() {
  const raw = process.env.ELASTICSEARCH_URL || "http://localhost:9200";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

/** Return connected Client or null when disabled/unreachable. */
async function getElasticsearchClient() {
  if (!isElasticsearchEnabled()) {
    return null;
  }
  if (client) {
    return client;
  }
  try {
    client = new Client({
      nodes: elasticsearchNodes(),
      requestTimeout: 5000,
      maxRetries: 1,
    });
    await client.ping();
    logger.info("elasticsearch", "connected", { nodes: elasticsearchNodes() });
    return client;
  } catch (err) {
    logger.warn("elasticsearch", "connect failed — search features degraded", {
      error: err.message,
    });
    client = null;
    return null;
  }
}

/** Drop cached client (after clear-index or connection errors). */
function resetElasticsearchClient() {
  client = null;
}

module.exports = {
  isElasticsearchEnabled,
  getElasticsearchClient,
  resetElasticsearchClient,
  elasticsearchNodes,
};
