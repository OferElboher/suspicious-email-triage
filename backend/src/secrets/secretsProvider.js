/**
 * Secrets-provider abstraction — enterprise pattern for loading credentials outside Git.
 *
 * Production teams point SECRETS_PROVIDER=aws at real AWS Secrets Manager.
 * Local Docker uses SECRETS_PROVIDER=mock-aws and the mock-secrets-manager container.
 * Unit tests and CI use SECRETS_PROVIDER=file with committed ci.secrets (fake values only).
 */
const fs = require("fs");
const path = require("path");

/** Default mock AWS Secrets Manager base URL inside Docker Compose. */
const DEFAULT_MOCK_AWS_URL = "http://mock-secrets-manager:4566";

/**
 * Resolve which on-disk secrets bundle matches the deployment slice (dev/staging/prod/ci).
 * @param {string} deploymentEnv
 * @returns {string} absolute path to a *.secrets file
 */
function resolveSecretsFilePath(deploymentEnv) {
  if (process.env.SECRETS_FILE) {
    return path.resolve(process.env.SECRETS_FILE);
  }
  const slice = String(deploymentEnv || "dev").toLowerCase();
  return path.resolve(__dirname, `../../${slice}.secrets`);
}

/**
 * Parse dotenv-style KEY=VALUE lines into a plain object (no shell expansion).
 * @param {string} raw
 * @returns {Record<string, string>}
 */
function parseSecretsText(raw) {
  const out = {};
  String(raw || "")
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return;
      }
      const eq = trimmed.indexOf("=");
      if (eq <= 0) {
        return;
      }
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (key) {
        out[key] = value;
      }
    });
  return out;
}

/**
 * Read secrets directly from a gitignored *.secrets file (fallback when mock AWS is down).
 * @param {string} filePath
 * @returns {Record<string, string>}
 */
function loadSecretsFromFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const raw = fs.readFileSync(filePath, "utf8");
  return parseSecretsText(raw);
}

/**
 * Build the AWS-style secret id, e.g. triage/dev — overridable via SECRETS_BUNDLE_ID.
 * @param {string} deploymentEnv
 * @returns {string}
 */
function secretBundleId(deploymentEnv) {
  return process.env.SECRETS_BUNDLE_ID || `triage/${String(deploymentEnv || "dev").toLowerCase()}`;
}

/**
 * Fetch one secret bundle from the mock AWS Secrets Manager HTTP API (GetSecretValue shape).
 * @param {string} deploymentEnv
 * @returns {Promise<Record<string, string>>}
 */
async function loadSecretsFromMockAws(deploymentEnv) {
  const baseUrl = (process.env.SECRETS_MANAGER_URL || DEFAULT_MOCK_AWS_URL).replace(/\/$/, "");
  const secretId = secretBundleId(deploymentEnv);
  const url = `${baseUrl}/v1/secrets/${encodeURIComponent(secretId)}`;

  let response;
  try {
    response = await fetch(url, { method: "GET" });
  } catch (err) {
    throw new Error(`mock AWS Secrets Manager unreachable at ${url}: ${err.message}`);
  }

  if (!response.ok) {
    throw new Error(
      `mock AWS Secrets Manager returned HTTP ${response.status} for secretId=${secretId}`
    );
  }

  const body = await response.json();
  const secretString = body.SecretString || "";
  if (typeof secretString === "string" && secretString.trim().startsWith("{")) {
    try {
      return JSON.parse(secretString);
    } catch {
      return parseSecretsText(secretString);
    }
  }
  return parseSecretsText(String(secretString));
}

/**
 * Create the active secrets provider based on SECRETS_PROVIDER (mock-aws | file | aws).
 * @param {{ deploymentEnv?: string }} [options]
 * @returns {{ load: () => Promise<Record<string, string>>, providerName: string }}
 */
function createSecretsProvider(options = {}) {
  const deploymentEnv = (
    options.deploymentEnv ||
    process.env.DEPLOYMENT_ENV ||
    process.env.APP_ENV ||
    "dev"
  ).toLowerCase();
  const providerName = (process.env.SECRETS_PROVIDER || "mock-aws").toLowerCase();

  if (providerName === "file") {
    const filePath = resolveSecretsFilePath(deploymentEnv);
    return {
      providerName: "file",
      load: async () => loadSecretsFromFile(filePath),
    };
  }

  if (providerName === "mock-aws" || providerName === "aws") {
    return {
      providerName,
      load: async () => {
        try {
          return await loadSecretsFromMockAws(deploymentEnv);
        } catch (err) {
          // Graceful fallback: read gitignored *.secrets when mock service is not running (local npm test).
          const filePath = resolveSecretsFilePath(deploymentEnv);
          const fromFile = loadSecretsFromFile(filePath);
          if (Object.keys(fromFile).length > 0) {
            return fromFile;
          }
          throw err;
        }
      },
    };
  }

  throw new Error(`Unsupported SECRETS_PROVIDER=${providerName}`);
}

/**
 * Merge secret key/value pairs into process.env without overwriting existing shell exports.
 * @param {Record<string, string>} secrets
 * @param {{ override?: boolean }} [options]
 */
function applySecretsToProcessEnv(secrets, options = {}) {
  const override = options.override !== false;
  Object.entries(secrets || {}).forEach(([key, value]) => {
    if (override || process.env[key] === undefined) {
      process.env[key] = String(value);
    }
  });
}

module.exports = {
  DEFAULT_MOCK_AWS_URL,
  resolveSecretsFilePath,
  parseSecretsText,
  loadSecretsFromFile,
  loadSecretsFromMockAws,
  createSecretsProvider,
  applySecretsToProcessEnv,
  secretBundleId,
};
