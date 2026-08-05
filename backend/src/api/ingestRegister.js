/**
 * Public mail-platform self-registration for default verdict webhook URLs.
 *
 * Pattern: shared-secret header before JWT (like /ingest/internal) but scoped to client registry only —
 * platform teams receive INGEST_CLIENT_REGISTRATION_TOKEN without full internal ingest privileges.
 * Technology: Express Router, Postgres ingest_clients via ingestClientsPg.js.
 */
const express = require("express");
const logger = require("../lib/logger");
const { upsertIngestClient } = require("../ingest/ingestClientsPg");

/** router: self-registration routes mounted at /ingest before JWT middleware. */
const router = express.Router();

/**
 * registrationTokenValid compares X-Ingest-Registration-Token to INGEST_CLIENT_REGISTRATION_TOKEN.
 * Falls back to INGEST_INTERNAL_TOKEN in dev when registration token is unset (documented in secrets guide).
 * @param {import("express").Request} req
 */
function registrationTokenValid(req) {
  const provided = String(req.get("X-Ingest-Registration-Token") || "").trim();
  const registration = String(process.env.INGEST_CLIENT_REGISTRATION_TOKEN || "").trim();
  const internal = String(process.env.INGEST_INTERNAL_TOKEN || "dev-ingest-internal-token").trim();
  const expected = registration || internal;
  return Boolean(expected && provided === expected);
}

/**
 * PUT /ingest/register/:clientId — mail platform registers its default verdict callback URL.
 * Body: { displayName, callbackUrl, isActive? }
 * Auth: X-Ingest-Registration-Token (INGEST_CLIENT_REGISTRATION_TOKEN in secrets)
 */
router.put("/register/:clientId", async (req, res) => {
  if (!registrationTokenValid(req)) {
    return res.status(401).json({ error: "invalid_registration_token" });
  }
  try {
    const row = await upsertIngestClient({
      clientId: req.params.clientId,
      displayName: req.body.displayName,
      callbackUrl: req.body.callbackUrl,
      isActive: req.body.isActive !== false,
    });
    logger.info("ingest", "mail platform self-registered callback URL", {
      clientId: row.client_id,
      callbackUrl: row.callback_url,
    });
    return res.json({
      client: {
        clientId: row.client_id,
        displayName: row.display_name,
        callbackUrl: row.callback_url,
        isActive: row.is_active,
      },
    });
  } catch (err) {
    if (err.message === "missing_required_fields" || err.message === "callback_url_must_be_http_or_https") {
      return res.status(400).json({ error: err.message });
    }
    logger.error("ingest", "self-registration failed", { error: err.message });
    return res.status(500).json({ error: "registration_failed" });
  }
});

module.exports = router;
