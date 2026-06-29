/**
 * Logical PostgreSQL backup builder — exports stats/auth metadata as JSON for S3 upload.
 *
 * Pattern: application-level snapshot (no pg_dump in container) — portable and testable.
 * Real disaster recovery would add mongodump/neo4j-admin; this implements roadmap §1.5 S3 path for stats DB.
 */
const { Pool } = require("pg");
const logger = require("../lib/logger");
const { statsPgUrl } = require("../config/runtime");
const { uploadBackupObject } = require("./s3BackupProvider");

/** pool: dedicated connection for backup reads (same URL as stats/metrics). */
const pool = new Pool({ connectionString: statsPgUrl() });

/**
 * Build JSON payload describing PostgreSQL statistics and auth summary.
 * Password hashes are intentionally omitted — restore uses bootstrap admin flow.
 * @returns {Promise<object>}
 */
async function buildPostgresBackupPayload() {
  const statsResult = await pool.query(
    `SELECT occurred_at, event_type, status, verdict, review_id
     FROM review_stats_events
     ORDER BY occurred_at DESC
     LIMIT 5000`
  );
  const userResult = await pool.query(
    `SELECT u.id, u.email, u.is_active, u.ui_theme,
            COALESCE(array_agg(r.name ORDER BY r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
     FROM auth_users u
     LEFT JOIN auth_user_roles ur ON ur.user_id = u.id
     LEFT JOIN auth_roles r ON r.id = ur.role_id
     GROUP BY u.id
     ORDER BY u.email ASC`
  );
  const eventCount = await pool.query("SELECT count(*)::int AS n FROM review_stats_events");

  return {
    schemaVersion: 1,
    backupType: "postgres_logical",
    createdAt: new Date().toISOString(),
    summary: {
      reviewStatsEventCount: eventCount.rows[0]?.n || 0,
      authUserCount: userResult.rows.length,
    },
    authUsers: userResult.rows.map((row) => ({
      id: row.id,
      email: row.email,
      is_active: row.is_active,
      ui_theme: row.ui_theme,
      roles: row.roles,
    })),
    reviewStatsEvents: statsResult.rows.map((row) => ({
      occurred_at: row.occurred_at,
      event_type: row.event_type,
      status: row.status,
      verdict: row.verdict,
      review_id: row.review_id,
    })),
  };
}

/**
 * Run backup: serialize payload and upload to S3 (mock or real).
 * @returns {Promise<{ key: string, bucket: string, size: number, summary: object }>}
 */
async function runPostgresBackupToS3() {
  const payload = await buildPostgresBackupPayload();
  const iso = payload.createdAt.replace(/[:.]/g, "-");
  const key = `postgres/logical-${iso}.json`;
  const body = JSON.stringify(payload, null, 2);
  const uploaded = await uploadBackupObject({ key, body, contentType: "application/json" });
  logger.info("backups", "postgres logical backup uploaded", {
    key: uploaded.key,
    bucket: uploaded.bucket,
    size: uploaded.size,
  });
  return {
    ...uploaded,
    summary: payload.summary,
    createdAt: payload.createdAt,
  };
}

module.exports = {
  buildPostgresBackupPayload,
  runPostgresBackupToS3,
};
