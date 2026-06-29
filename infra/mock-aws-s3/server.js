/**
 * Mock Amazon S3 — local stand-in for PutObject / ListObjectsV2 / GetObject.
 *
 * Real AWS S3 uses REST with path-style or virtual-hosted URLs. This mock keeps objects
 * in memory and exposes a simplified path-style API so @aws-sdk/client-s3 with a custom
 * endpoint works in Docker dev without billing or IAM setup.
 *
 * Technology: Node.js http module; Map<string, Buffer> keyed by "bucket/key".
 */
const http = require("http");
const { URL } = require("url");

/** Listen port — 4568 chosen to avoid clashing with mock-secrets (4566) and snowflake (4567). */
const PORT = Number(process.env.MOCK_S3_PORT || 4568);

/** @type {Map<string, { body: Buffer, contentType: string, lastModified: string }>} */
const objects = new Map();

/**
 * Build storage key from bucket + object key segments.
 * @param {string} bucket
 * @param {string} key
 */
function storageKey(bucket, key) {
  return `${bucket}/${key}`;
}

/** Parse request path into { bucket, key } or null when invalid. */
function parsePath(pathname) {
  const parts = pathname.replace(/^\/+/, "").split("/").filter(Boolean);
  if (parts.length < 1) {
    return null;
  }
  const bucket = parts[0];
  const key = parts.slice(1).join("/");
  return { bucket, key };
}

/** Send JSON error compatible with AWS XML error shape (simplified). */
function sendError(res, status, code, message) {
  res.writeHead(status, { "Content-Type": "application/xml" });
  res.end(
    `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${message}</Message></Error>`
  );
}

/** Handle ListObjectsV2-style GET /bucket?list-type=2 */
function handleList(bucket, res) {
  const prefix = "";
  const contents = [];
  for (const [fullKey, meta] of objects.entries()) {
    if (!fullKey.startsWith(`${bucket}/`)) {
      continue;
    }
    const key = fullKey.slice(bucket.length + 1);
    if (prefix && !key.startsWith(prefix)) {
      continue;
    }
    contents.push({ Key: key, LastModified: meta.lastModified, Size: meta.body.length });
  }
  contents.sort((a, b) => a.Key.localeCompare(b.Key));
  const items = contents
    .map(
      (item) =>
        `<Contents><Key>${item.Key}</Key><LastModified>${item.LastModified}</LastModified><Size>${item.Size}</Size></Contents>`
    )
    .join("");
  res.writeHead(200, { "Content-Type": "application/xml" });
  res.end(
    `<?xml version="1.0"?><ListBucketResult><Name>${bucket}</Name><IsTruncated>false</IsTruncated>${items}</ListBucketResult>`
  );
}

/** Read full request body into a Buffer. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
    const parsed = parsePath(url.pathname);
    if (!parsed) {
      sendError(res, 404, "NoSuchKey", "Invalid path");
      return;
    }
    const { bucket, key } = parsed;

    if (req.method === "GET" && !key && url.searchParams.get("list-type") === "2") {
      handleList(bucket, res);
      return;
    }

    if (req.method === "PUT" && key) {
      const body = await readBody(req);
      const contentType = req.headers["content-type"] || "application/octet-stream";
      objects.set(storageKey(bucket, key), {
        body,
        contentType,
        lastModified: new Date().toISOString(),
      });
      res.writeHead(200, { ETag: `"mock-etag-${body.length}"` });
      res.end("");
      return;
    }

    if (req.method === "GET" && key) {
      const stored = objects.get(storageKey(bucket, key));
      if (!stored) {
        sendError(res, 404, "NoSuchKey", "The specified key does not exist.");
        return;
      }
      res.writeHead(200, {
        "Content-Type": stored.contentType,
        "Content-Length": stored.body.length,
      });
      res.end(stored.body);
      return;
    }

    if (req.method === "DELETE" && key) {
      objects.delete(storageKey(bucket, key));
      res.writeHead(204);
      res.end("");
      return;
    }

    sendError(res, 405, "MethodNotAllowed", "Unsupported operation");
  } catch (err) {
    sendError(res, 500, "InternalError", err.message || "mock s3 error");
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[mock-aws-s3] listening on :${PORT} (in-memory object store)`);
});
