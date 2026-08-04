/**
 * Mock verdict callback receiver — dev stand-in for customer mail platform webhooks.
 *
 * Real SEG/Graph adapters expose HTTPS endpoints that accept verdict JSON and drive
 * quarantine/release actions. This mock stores POST bodies in memory for demos and tests.
 *
 * Technology: Node.js http module; in-memory array (like mock-s3 Map pattern).
 * Port 4569 — see infra/docker/docker-compose.yml service mock-verdict-callback.
 */
const http = require("http");
const crypto = require("crypto");
const { URL } = require("url");

/** Listen port — 4569 avoids mock-secrets (4566), snowflake (4567), s3 (4568). */
const PORT = Number(process.env.MOCK_VERDICT_CALLBACK_PORT || 4569);

/** Dev HMAC secret — must match VERDICT_CALLBACK_HMAC_SECRET in backend dev.secrets. */
const HMAC_SECRET = process.env.VERDICT_CALLBACK_HMAC_SECRET || "dev-verdict-callback-hmac";

/** @type {Array<{ receivedAt: string, payload: object, signatureValid: boolean, httpStatus: number }>} */
const receivedCallbacks = [];

/** Max in-memory rows — oldest dropped to prevent unbounded growth in long dev sessions. */
const MAX_STORED = 500;

/**
 * Verify X-Verdict-Signature HMAC against raw JSON body.
 * @param {string} rawBody
 * @param {string|null} signatureHeader
 */
function signatureValid(rawBody, signatureHeader) {
  if (!signatureHeader) {
    return false;
  }
  const expected = crypto.createHmac("sha256", HMAC_SECRET).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(signatureHeader, "utf8"));
  } catch {
    return false;
  }
}

/** Read request body as UTF-8 string. */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** Send JSON response with status code. */
function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

/** Append one callback record and trim store. */
function storeCallback(entry) {
  receivedCallbacks.unshift(entry);
  if (receivedCallbacks.length > MAX_STORED) {
    receivedCallbacks.length = MAX_STORED;
  }
}

/** HTTP request handler — routes by pathname. */
async function handleRequest(req, res) {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  const path = url.pathname.replace(/\/+$/, "") || "/";

  if (req.method === "GET" && (path === "/health" || path === "")) {
    return sendJson(res, 200, { status: "ok", service: "mock-verdict-callback" });
  }

  if (req.method === "GET" && path === "/stats") {
    const delivered = receivedCallbacks.filter((r) => r.signatureValid).length;
    const invalidSig = receivedCallbacks.length - delivered;
    const byVerdict = {};
    for (const row of receivedCallbacks) {
      const v = row.payload?.verdict || row.payload?.effectiveVerdict || "unknown";
      byVerdict[v] = (byVerdict[v] || 0) + 1;
    }
    return sendJson(res, 200, {
      total: receivedCallbacks.length,
      signatureValid: delivered,
      signatureInvalid: invalidSig,
      byVerdict,
    });
  }

  if (req.method === "GET" && path === "/callbacks") {
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);
    return sendJson(res, 200, { callbacks: receivedCallbacks.slice(0, limit) });
  }

  if (req.method === "POST" && (path === "/webhook" || path === "/")) {
    const raw = await readBody(req);
    let payload = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      return sendJson(res, 400, { error: "invalid_json" });
    }
    const sig = req.headers["x-verdict-signature"] || null;
    const valid = signatureValid(raw, sig);
    storeCallback({
      receivedAt: new Date().toISOString(),
      payload,
      signatureValid: valid,
      httpStatus: 200,
    });
    return sendJson(res, 200, { ok: true, signatureValid: valid });
  }

  if (req.method === "DELETE" && path === "/callbacks") {
    receivedCallbacks.length = 0;
    return sendJson(res, 200, { cleared: true });
  }

  sendJson(res, 404, { error: "not_found" });
}

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((err) => {
    sendJson(res, 500, { error: err.message });
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`mock-verdict-callback listening on :${PORT}`);
});
