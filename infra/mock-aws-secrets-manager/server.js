/**
 * Mock AWS Secrets Manager — local stand-in for GetSecretValue (LocalStack REST + AWS JSON 1.1).
 *
 * Real AWS Secrets Manager uses HTTPS POST with header X-Amz-Target: secretsmanager.GetSecretValue
 * and JSON body { "SecretId": "..." }. LocalStack also exposes GET /v1/secrets/{id} for simplicity.
 *
 * This server implements BOTH shapes so Node/Python clients and AWS-SDK-style tools work in dev.
 * Response fields match AWS GetSecretValue: SecretString, ARN, Name, VersionId, CreatedDate.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

/** Listen port — 4566 mirrors LocalStack's default Secrets Manager port for familiarity. */
const PORT = Number(process.env.MOCK_SECRETS_PORT || 4566);
/** Resolve secrets bundle directory (overridable in tests via SECRETS_ROOT env). */
function secretsRoot() {
  return path.resolve(
    process.env.SECRETS_ROOT || path.join(__dirname, "../../backend")
  );
}

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
  return path.join(secretsRoot(), `${match[1].toLowerCase()}.secrets`);
}

/** AWS JSON 1.1 target header value for GetSecretValue RPC. */
const AWS_GET_SECRET_TARGET = "secretsmanager.GetSecretValue";

/**
 * Build AWS GetSecretValue-compatible JSON from a dotenv secrets file.
 * @param {string} secretId
 * @param {string} filePath
 * @returns {object}
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

/**
 * Resolve secret file and return GetSecretValue payload, or null when not found.
 * @param {string} secretId
 * @returns {{ status: number, body: object }|null}
 */
function getSecretResponse(secretId) {
  const filePath = secretIdToFilePath(secretId);
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      status: 404,
      body: {
        __type: "ResourceNotFoundException",
        message: `Secrets Manager can't find the specified secret: ${secretId}`,
      },
    };
  }
  return { status: 200, body: buildSecretPayload(secretId, filePath) };
}

/** Parse JSON request body from incoming HTTP request. */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8").trim();
        resolve(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

/**
 * Route one HTTP request — supports health, LocalStack GET, and AWS JSON 1.1 POST.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
async function handleRequest(req, res) {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "mock-aws-secrets-manager" }));
    return;
  }

  const secretsMatch = url.pathname.match(/^\/v1\/secrets\/(.+)$/);
  if (req.method === "GET" && secretsMatch) {
    const secretId = decodeURIComponent(secretsMatch[1]);
    const result = getSecretResponse(secretId);
    res.writeHead(result.status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result.body));
    return;
  }

  // AWS SDK / real Secrets Manager wire protocol (JSON 1.1 over POST /).
  if (req.method === "POST" && (url.pathname === "/" || url.pathname === "")) {
    const target = String(req.headers["x-amz-target"] || req.headers["X-Amz-Target"] || "");
    if (target.toLowerCase() === AWS_GET_SECRET_TARGET.toLowerCase()) {
      try {
        const body = await readJsonBody(req);
        const secretId = body.SecretId || body.secretId;
        const result = getSecretResponse(String(secretId || ""));
        res.writeHead(result.status, { "Content-Type": "application/x-amz-json-1.1" });
        res.end(JSON.stringify(result.body));
        return;
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: err.message }));
        return;
      }
    }
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ message: "Not found" }));
}

/** Start HTTP listener when executed as main module. */
const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: err.message }));
  });
});

if (require.main === module) {
  server.listen(PORT, "0.0.0.0", () => {
    // eslint-disable-next-line no-console
    console.log(`mock-aws-secrets-manager listening on :${PORT}, SECRETS_ROOT=${secretsRoot()}`);
  });
}

module.exports = {
  secretIdToFilePath,
  buildSecretPayload,
  getSecretResponse,
  handleRequest,
  AWS_GET_SECRET_TARGET,
};
