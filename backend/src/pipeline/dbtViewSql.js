/**
 * Compiled SQL for the dbt model review_stats_daily (no Jinja).
 *
 * Keep in sync with orchestration/dbt_demo/models/review_stats_daily.sql — dbt adds
 * {{ source() }} macros; the Node API uses this literal for CREATE VIEW and queries.
 */
const REVIEW_STATS_DAILY_VIEW_SQL = `
SELECT
    date_trunc('day', occurred_at) AS stats_day,
    COUNT(*)::bigint AS event_count
FROM review_stats_events
GROUP BY 1
`.trim();

/** PostgreSQL view name materialized from the dbt demo model. */
const DBT_VIEW_NAME = "review_stats_daily";

module.exports = {
  REVIEW_STATS_DAILY_VIEW_SQL,
  DBT_VIEW_NAME,
};
