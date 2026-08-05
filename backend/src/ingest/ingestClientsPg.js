/**
 * PostgreSQL registry for mail ingest clients — each client email platform gets its own default verdict webhook URL.
 *
 * Pattern: narrow config table in Postgres (same database as review_stats_events); Mongo Review stores
 * ingestClientId per message for lookup at verdict delivery time.
 * Technology: node-pg Pool (shared with statsPg.js connection string via statsPgUrl()).
 */
const { Pool } = require("pg");
const logger = require("../lib/logger");
const { statsPgUrl } = require("../config/runtime");

/** pool: PostgreSQL connection pool for ingest client registry rows. */
const pool = new Pool({
  connectionString: statsPgUrl(),
});

/** ensurePromise: memoized schema + dev seed initialization. */
let ensurePromise;

/**
 * ensureIngestClientsSchema creates ingest_clients and seeds dev defaults idempotently.
 * Dev seeds point at mock-verdict-callback — production rows are inserted via admin API or SQL migration.
 */
async function ensureIngestClientsSchema() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ingest_clients (
          client_id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          callback_url TEXT NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_ingest_clients_active
          ON ingest_clients (is_active) WHERE is_active = true;
      `);
      // Dev/demo clients — each mail platform integration registers a unique client_id.
      await pool.query(
        `INSERT INTO ingest_clients (client_id, display_name, callback_url, is_active)
         VALUES
           ('dev-mock', 'Dev mock SEG (Docker mock-verdict-callback)', 'http://mock-verdict-callback:4569/webhook', true),
           ('dev-contoso-graph', 'Example Contoso Microsoft Graph adapter', 'http://mock-verdict-callback:4569/webhook', true),
           ('dev-fabrikam-postfix', 'Example Fabrikam Postfix milter adapter', 'http://mock-verdict-callback:4569/webhook', true)
         ON CONFLICT (client_id) DO NOTHING`
      );
    })().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }
  return ensurePromise;
}

/**
 * getIngestClient loads one active client row by client_id (case-sensitive slug).
 * @param {string} clientId
 * @returns {Promise<object|null>}
 */
async function getIngestClient(clientId) {
  const id = String(clientId || "").trim();
  if (!id) {
    return null;
  }
  try {
    await ensureIngestClientsSchema();
    const { rows } = await pool.query(
      `SELECT client_id, display_name, callback_url, is_active, created_at, updated_at
       FROM ingest_clients
       WHERE client_id = $1 AND is_active = true`,
      [id]
    );
    return rows[0] || null;
  } catch (err) {
    logger.warn("ingest_clients", "lookup failed", { clientId: id, error: err.message });
    return null;
  }
}

/**
 * listIngestClients returns all clients for admin/metrics dashboards.
 * @param {{ includeInactive?: boolean }} options
 */
async function listIngestClients({ includeInactive = true } = {}) {
  await ensureIngestClientsSchema();
  const where = includeInactive ? "" : "WHERE is_active = true";
  const { rows } = await pool.query(
    `SELECT client_id, display_name, callback_url, is_active, created_at, updated_at
     FROM ingest_clients
     ${where}
     ORDER BY client_id ASC`
  );
  return rows;
}

/**
 * upsertIngestClient creates or updates a mail platform registration.
 * @param {{ clientId: string, displayName: string, callbackUrl: string, isActive?: boolean }} input
 */
async function upsertIngestClient({ clientId, displayName, callbackUrl, isActive = true }) {
  const id = String(clientId || "").trim();
  const name = String(displayName || "").trim();
  const url = String(callbackUrl || "").trim();
  if (!id || !name || !url) {
    throw new Error("missing_required_fields");
  }
  if (!/^https?:\/\//i.test(url)) {
    throw new Error("callback_url_must_be_http_or_https");
  }
  await ensureIngestClientsSchema();
  const { rows } = await pool.query(
    `INSERT INTO ingest_clients (client_id, display_name, callback_url, is_active, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (client_id) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       callback_url = EXCLUDED.callback_url,
       is_active = EXCLUDED.is_active,
       updated_at = now()
     RETURNING client_id, display_name, callback_url, is_active, created_at, updated_at`,
    [id, name, url, Boolean(isActive)]
  );
  return rows[0];
}

module.exports = {
  ensureIngestClientsSchema,
  getIngestClient,
  listIngestClients,
  upsertIngestClient,
};
