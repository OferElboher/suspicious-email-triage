/**
 * Snowflake analytical table names and column documentation.
 *
 * Pattern: OLAP denormalized tables — optimized for reporting, not OLTP like MongoDB.
 * MongoDB remains the operational source of truth; Snowflake receives exported snapshots.
 */
const ANALYTICS_TABLES = {
  /** One row per completed review with verdicts, findings summary, override flags. */
  REVIEWS_ANALYTICS: "REVIEWS_ANALYTICS",
  /** Processing duration and pipeline status metrics per review. */
  PROCESSING_METRICS: "PROCESSING_METRICS",
  /** Analyst override audit rows for compliance reporting. */
  OVERRIDE_EVENTS: "OVERRIDE_EVENTS",
};

module.exports = { ANALYTICS_TABLES };
