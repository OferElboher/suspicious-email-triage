/**
 * PostgreSQL statistics store for chart data.
 * MongoDB keeps full review documents; PostgreSQL keeps narrow time-series events.
 */
const { Pool } = require("pg");
const logger = require("../lib/logger");
const { statsPgUrl } = require("../config/runtime");

/** pool: shared PostgreSQL connection pool reused by metrics and writers. */
const pool = new Pool({
  connectionString: statsPgUrl(),
});

/** ensurePromise: memoized schema initialization so every caller can be lazy. */
let ensurePromise;

/** ensureStatsSchema creates the compact table and indexes used by chart queries. */
async function ensureStatsSchema() {
  if (!ensurePromise) {
    ensurePromise = pool.query(`
      CREATE TABLE IF NOT EXISTS review_stats_events (
        id BIGSERIAL PRIMARY KEY,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        event_type TEXT NOT NULL,
        status TEXT,
        verdict TEXT,
        review_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_review_stats_events_time
        ON review_stats_events (occurred_at);
      CREATE INDEX IF NOT EXISTS idx_review_stats_events_type_time
        ON review_stats_events (event_type, occurred_at);
      CREATE INDEX IF NOT EXISTS idx_review_stats_events_status_time
        ON review_stats_events (status, occurred_at);
    `);
  }
  return ensurePromise;
}

/** recordStatsEvent writes one narrow event for metrics without reading MongoDB. */
async function recordStatsEvent({
  eventType,
  status = null,
  verdict = null,
  reviewId = null,
  occurredAt = new Date(),
}) {
  try {
    await ensureStatsSchema();
    await pool.query(
      `INSERT INTO review_stats_events
       (occurred_at, event_type, status, verdict, review_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [occurredAt, eventType, status, verdict, reviewId]
    );
  } catch (err) {
    logger.warn("stats", "postgres event write failed", { error: err.message });
  }
}

/** bucketExpression maps UI bucket values to efficient PostgreSQL date truncation. */
function bucketExpression(bucket) {
  if (bucket === "15m") {
    return "to_timestamp(floor(extract(epoch from occurred_at) / 900) * 900)";
  }
  if (bucket === "1d") {
    return "date_trunc('day', occurred_at)";
  }
  return "date_trunc('hour', occurred_at)";
}

/** getTimeseries returns event counts bucketed for chart rendering. */
async function getTimeseries({ from, to, bucket, eventType = "review_created" }) {
  await ensureStatsSchema();
  const bucketSql = bucketExpression(bucket);
  const normalizedType = String(eventType || "review_created").trim();
  const { rows } = await pool.query(
    `SELECT ${bucketSql} AS bucket_start, count(*)::int AS count
     FROM review_stats_events
     WHERE occurred_at >= $1
       AND occurred_at <= $2
       AND event_type = $3
     GROUP BY bucket_start
     ORDER BY bucket_start ASC`,
    [from, to, normalizedType]
  );
  return rows.map((row) => ({
    t: row.bucket_start ? new Date(row.bucket_start).toISOString() : null,
    count: row.count,
  }));
}

/** getStatusBreakdown returns status transition counts for the selected window. */
async function getStatusBreakdown({ from, to }) {
  await ensureStatsSchema();
  const { rows } = await pool.query(
    `SELECT coalesce(status, 'unknown') AS status, count(*)::int AS count
     FROM review_stats_events
     WHERE occurred_at >= $1
       AND occurred_at <= $2
       AND event_type = 'status_changed'
     GROUP BY status
     ORDER BY status ASC`,
    [from, to]
  );
  return rows.map((row) => ({ status: row.status, count: row.count }));
}

/** resetStats truncates only statistics tables; dev reset calls this before demos. */
async function resetStats() {
  await ensureStatsSchema();
  await pool.query("TRUNCATE TABLE review_stats_events RESTART IDENTITY");
}

module.exports = {
  ensureStatsSchema,
  recordStatsEvent,
  getTimeseries,
  getStatusBreakdown,
  resetStats,
};
