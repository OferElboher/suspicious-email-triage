/**
 * HMAC signing for outbound verdict webhook payloads.
 *
 * Pattern: shared-secret HMAC-SHA256 — mail platforms verify X-Verdict-Signature
 * without JWT exchange. Same idea as GitHub webhook signatures.
 * Technology: Node crypto.createHmac (built-in, no extra dependency).
 */
const crypto = require("crypto");

/** Default dev secret — production must set VERDICT_CALLBACK_HMAC_SECRET in secrets manager. */
const DEFAULT_DEV_SECRET = "dev-verdict-callback-hmac";

/**
 * Resolve the HMAC secret from environment (never log the value).
 * @returns {string}
 */
function verdictCallbackSecret() {
  return process.env.VERDICT_CALLBACK_HMAC_SECRET || DEFAULT_DEV_SECRET;
}

/**
 * Sign a JSON-serializable payload for the X-Verdict-Signature header.
 * @param {object} payload
 * @returns {string} hex digest
 */
function signVerdictPayload(payload) {
  const body = JSON.stringify(payload);
  return crypto.createHmac("sha256", verdictCallbackSecret()).update(body).digest("hex");
}

module.exports = { signVerdictPayload, verdictCallbackSecret };
