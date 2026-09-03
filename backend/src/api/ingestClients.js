/**
 * JWT-authenticated CRUD for mail platform ingest client registry (Postgres ingest_clients).
 *
 * Usage flow (operator UI):
 *  1. Admin/manager/developer opens #ingest → RegisterIngestClientForm.
 *  2. Form calls PUT /ingest/clients/:clientId with Bearer JWT (ingest.clients.write).
 *  3. upsertIngestClient stores default verdict webhook URL for that ingestClientId.
 *
 * Usage flow (read-only):
 *  GET /ingest/clients with metrics.read → list for dashboards or scripts.
 *
 * Technology: Express Router, requirePermission middleware, ingestClientsPg.js.
 */
const express = require("express");
const logger = require("../lib/logger");
const { listIngestClients, upsertIngestClient } = require("../ingest/ingestClientsPg");
const { requirePermission } = require("../http/middleware/auth");

/** router: authenticated ingest client routes mounted at /ingest/clients. */
const router = express.Router();

/** mapClientRow converts Postgres snake_case row to camelCase API JSON. */
function mapClientRow(row) {
  return {
    clientId: row.client_id,
    displayName: row.display_name,
    callbackUrl: row.callback_url,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * GET /ingest/clients — list registered mail platforms (metrics.read for SOC visibility).
 */
router.get("/", requirePermission("metrics.read"), async (_req, res) => {
  try {
    const rows = await listIngestClients({ includeInactive: true });
    return res.json({ clients: rows.map(mapClientRow) });
  } catch (err) {
    logger.error("ingest", "list clients failed", { error: err.message });
    return res.status(500).json({ error: "list_clients_failed" });
  }
});

/**
 * PUT /ingest/clients/:clientId — register or update one platform default webhook (ingest.clients.write).
 * Body: { displayName, callbackUrl, isActive? }
 */
router.put("/:clientId", requirePermission("ingest.clients.write"), async (req, res) => {
  try {
    const row = await upsertIngestClient({
      clientId: req.params.clientId,
      displayName: req.body.displayName,
      callbackUrl: req.body.callbackUrl,
      isActive: req.body.isActive !== false,
    });
    logger.info("ingest", "ingest client upserted via JWT API", { clientId: row.client_id });
    return res.json({ client: mapClientRow(row) });
  } catch (err) {
    if (err.message === "missing_required_fields" || err.message === "callback_url_must_be_http_or_https") {
      return res.status(400).json({ error: err.message });
    }
    logger.error("ingest", "upsert client failed", { error: err.message });
    return res.status(500).json({ error: "upsert_client_failed" });
  }
});

module.exports = router;
