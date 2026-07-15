/**
 * Base64-encoded secret-pattern fixtures for docSecretScan unit tests.
 *
 * GitHub secret scanning flags static MongoDB Atlas URIs even in test files.
 * Fixtures are stored as base64 and decoded only at test runtime.
 */

/** Map of fixture id → base64 payload (never commit decoded credential-like strings). */
const FIXTURE_B64 = {
  /** Full env line: MONGO_URI with Atlas-style SRV credentials. */
  atlasUriEnvLine:
    "TU9OR09fVVJJPW1vbmdvZGIrc3J2Oi8vdHJpYWdlX2FwcDpTRUNSRVRAY2x1c3Rlci54eHh4eC5tb25nb2RiLm5ldC90cmlhZ2Vfc3RhZ2luZw==",
  /** Bare Atlas-style SRV URI (mock markdown injection). */
  atlasUriBare: "bW9uZ29kYitzcnY6Ly91c2VyOnBhc3NAaG9zdC5tb25nb2RiLm5ldC9kYg==",
  /** Remote staging postgres URL with embedded password. */
  stagingPostgresUri:
    "cG9zdGdyZXM6Ly9TVEFHSU5HX1VTRVI6U1RBR0lOR19QQVNTQHN0YWdpbmctcG9zdGdyZXMuZXhhbXBsZS5uZXQ6NTQzMi90cmlhZ2Vfc3RhdHM=",
  /** OpenAI-style API key env assignment. */
  openAiKeyEnvLine: "TExNX0FQSV9LRVk9c2stYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXo=",
};

/**
 * Decode a named fixture to UTF-8 text for assertions against the scanner.
 * @param {keyof typeof FIXTURE_B64} name
 * @returns {string}
 */
function decodeDocSecretFixture(name) {
  const encoded = FIXTURE_B64[name];
  if (!encoded) {
    throw new Error(`Unknown docSecretScan fixture: ${name}`);
  }
  return Buffer.from(encoded, "base64").toString("utf8");
}

module.exports = {
  FIXTURE_B64,
  decodeDocSecretFixture,
};
