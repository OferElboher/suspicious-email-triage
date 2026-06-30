/**
 * dbt daily rollup reader — ensures the review_stats_daily VIEW exists, then queries it.
 *
 * Pattern: ELT "T" layer — raw events live in review_stats_events (Node writer); dbt model
 * defines the rollup SQL; this module materializes that SQL as a VIEW when missing so the
 * React analytics tab can chart dbt output without a separate dbt CLI step in dev.
 *
 * Technology: PostgreSQL CREATE OR REPLACE VIEW; pg pool from statsPgUrl().
 */
const { Pool } = require("pg");
const logger = require("../lib/logger");
const { statsPgUrl } = require("../config/runtime");
const { ensureStatsSchema } = require("../stats/statsPg");
const { REVIEW_STATS_DAILY_VIEW_SQL, DBT_VIEW_NAME } = require("./dbtViewSql");

/** pool: shared Postgres connection for dbt view DDL and SELECT. */
const pool = new Pool({ connectionString: statsPgUrl() });

/** ensurePromise: memoize one-time VIEW creation per process. */
let ensurePromise;

/**
 * Create or replace the dbt demo view so GET /pipeline/dbt-daily matches dbt run output.
 * @returns {Promise<void>}
 */
async function ensureReviewStatsDailyView() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await ensureStatsSchema();
      await pool.query(
        `CREATE OR REPLACE VIEW ${DBT_VIEW_NAME} AS ${REVIEW_STATS_DAILY_VIEW_SQL}`
      );
      logger.info("pipeline", "dbt view ensured", { view: DBT_VIEW_NAME });
    })().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }
  return ensurePromise;
}

/**
 * Return daily rollup rows from the dbt materialized view (newest days first in API).
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<{ model: string, materialization: string, rows: Array<{ stats_day: string, event_count: number }> }>}
 */
async function getDbtDailyRollup(opts = {}) {
  await ensureReviewStatsDailyView();
  const limit = Math.min(Math.max(parseInt(opts.limit || "14", 10), 1), 90);
  const { rows } = await pool.query(
    `SELECT stats_day, event_count::int AS event_count
     FROM ${DBT_VIEW_NAME}
     ORDER BY stats_day DESC
     LIMIT $1`,
    [limit]
  );
  return {
    model: "review_stats_daily",
    project: "triage_dbt_demo",
    materialization: "view",
    source: "dbt-demo",
    rows: rows.map((row) => ({
      stats_day: row.stats_day ? new Date(row.stats_day).toISOString() : null,
      event_count: row.event_count,
      label: row.stats_day ? new Date(row.stats_day).toLocaleDateString() : "",
    })),
  };
}

module.exports = {
  ensureReviewStatsDailyView,
  getDbtDailyRollup,
};
