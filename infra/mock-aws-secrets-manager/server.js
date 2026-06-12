/**
 * Mock AWS Secrets Manager — free local stand-in for GetSecretValue.
 *
 * Serves gitignored backend/*.secrets files over HTTP so containers fetch credentials
 * at startup instead of baking them into Compose env_file entries.
 * Replace SECRETS_MANAGER_URL with a real AWS endpoint in production (same client shape).
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

/** Listen port — 4566 mirrors LocalStack's default Secrets Manager port for familiarity. */
const PORT = Number(process.env.MOCK_SECRETS_PORT || 4566);
/** Directory holding dev.secrets, staging.secrets, prod.secrets, ci.secrets bundles. */
const SECRETS_ROOT = path.resolve(
  process.env.SECRETS_ROOT || path.join(__dirname, "../../backend")
);

/**
 * Map AWS secret id "triage/dev" → backend/dev.secrets on disk.
 * @param {string} secretId
 * @returns {string|null}
 */
function secretIdToFilePath(secretId) {
  const normalized = String(secretId || "").trim();
  const match = normalized.match(/^triage\/(dev|staging|prod|ci)$/i);
  if (!match) {
    return null;
  }
  return path.join(SECRETS_ROOT, `${match[1].toLowerCase()}.secrets`);
}

/**
 * Build AWS GetSecretValue-compatible JSON from a dotenv secrets file.
 * @param {string} secretId
 * @param {string} filePath
 */
function buildSecretPayload(secretId, filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return {
    ARN: `arn:aws:secretsmanager:local:000000000000:secret:${secretId}`,
    Name: secretId,
    SecretString: raw,
    VersionId: "mock-version-1",
    CreatedDate: new Date().toISOString(),
  };
}

/** Minimal HTTP router — only GET /v1/secrets/:secretId is supported. */
const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "mock-aws-secrets-manager" }));
    return;
  }

  const secretsMatch = url.pathname.match(/^\/v1\/secrets\/(.+)$/);
  if (req.method === "GET" && secretsMatch) {
    const secretId = decodeURIComponent(secretsMatch[1]);
    const filePath = secretIdToFilePath(secretId);
    if (!filePath || !fs.existsSync(filePath)) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: `Secret ${secretId} not found` }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(buildSecretPayload(secretId, filePath)));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ message: "Not found" }));
});

server.listen(PORT, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`mock-aws-secrets-manager listening on :${PORT}, SECRETS_ROOT=${SECRETS_ROOT}`);
});
