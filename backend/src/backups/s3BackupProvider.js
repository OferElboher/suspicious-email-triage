/**
 * S3 backup provider — abstraction for Amazon S3 (staging/prod) and mock-aws-s3 (dev).
 *
 * Pattern: same factory style as secretsProvider.js — BACKUP_PROVIDER env selects implementation.
 * Technology: @aws-sdk/client-s3 with custom endpoint for mock; path-style addressing for LocalStack compatibility.
 */
const {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");

/** Default mock S3 base URL inside Docker Compose. */
const DEFAULT_MOCK_S3_URL = "http://mock-s3:4568";

/**
 * Resolve backup provider mode from environment.
 * @returns {"mock-aws"|"aws"|"disabled"}
 */
function backupProviderMode() {
  const raw = String(process.env.BACKUP_PROVIDER || "mock-aws").trim().toLowerCase();
  if (raw === "disabled" || raw === "off" || raw === "false") {
    return "disabled";
  }
  if (raw === "aws") {
    return "aws";
  }
  return "mock-aws";
}

/** S3 bucket name for database backup objects. */
function backupBucketName() {
  return process.env.BACKUP_S3_BUCKET || "triage-dev-backups";
}

/** AWS region for real S3 client (mock ignores region but SDK requires one). */
function backupAwsRegion() {
  return process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
}

/**
 * Build S3Client — mock uses custom endpoint + path-style; aws uses default endpoint.
 * @returns {import("@aws-sdk/client-s3").S3Client}
 */
function createS3Client() {
  const mode = backupProviderMode();
  if (mode === "mock-aws") {
    const endpoint = process.env.BACKUP_S3_ENDPOINT || DEFAULT_MOCK_S3_URL;
    return new S3Client({
      region: backupAwsRegion(),
      endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "mock-access-key",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "mock-secret-key",
      },
    });
  }
  return new S3Client({ region: backupAwsRegion() });
}

/**
 * Upload one backup object to S3.
 * @param {{ key: string, body: string|Buffer, contentType?: string }} params
 */
async function uploadBackupObject({ key, body, contentType = "application/json" }) {
  const client = createS3Client();
  const bucket = backupBucketName();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: typeof body === "string" ? Buffer.from(body, "utf8") : body,
      ContentType: contentType,
    })
  );
  return { bucket, key, size: Buffer.byteLength(body) };
}

/**
 * List backup object keys (newest first by key name — ISO timestamps sort lexicographically).
 * @param {{ prefix?: string, maxKeys?: number }} [opts]
 */
async function listBackupObjects(opts = {}) {
  const client = createS3Client();
  const bucket = backupBucketName();
  const prefix = opts.prefix || "postgres/";
  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: Math.min(opts.maxKeys || 50, 100),
    })
  );
  const items = (response.Contents || []).map((entry) => ({
    key: entry.Key,
    size: entry.Size,
    lastModified: entry.LastModified ? entry.LastModified.toISOString() : null,
  }));
  items.sort((a, b) => String(b.key).localeCompare(String(a.key)));
  return { bucket, prefix, items };
}

/**
 * Download one backup object body as UTF-8 text.
 * @param {string} key
 */
async function downloadBackupObject(key) {
  const client = createS3Client();
  const bucket = backupBucketName();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
  const chunks = [];
  for await (const chunk of response.Body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Return provider metadata for status endpoints (no secrets). */
function backupProviderStatus() {
  const mode = backupProviderMode();
  return {
    enabled: mode !== "disabled",
    provider: mode,
    bucket: backupBucketName(),
    endpoint:
      mode === "mock-aws"
        ? process.env.BACKUP_S3_ENDPOINT || DEFAULT_MOCK_S3_URL
        : `https://s3.${backupAwsRegion()}.amazonaws.com`,
  };
}

module.exports = {
  backupProviderMode,
  backupBucketName,
  createS3Client,
  uploadBackupObject,
  listBackupObjects,
  downloadBackupObject,
  backupProviderStatus,
};
