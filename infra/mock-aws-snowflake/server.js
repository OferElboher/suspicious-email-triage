/**
 * Mock AWS Snowflake analytics layer — in-memory stand-in for Snowflake SQL API.
 *
 * Pattern: Node HTTP server stores analytical rows in memory (no disk/cloud persistence).
 * Technology: plain http module; REST contract consumed by backend/src/analytics/snowflakeClient.js.
 *
 * Note: this is NOT the full Snowflake SQL API — it implements the project's analytics export/reporting
 * endpoints only. Production would point SNOWFLAKE_URL at a real warehouse proxy or ETL sink.
 */
const http = require("http");
const crypto = require("crypto");

/** Listen port — 4567 chosen to sit beside mock Secrets Manager (4566). */
const PORT = Number(process.env.MOCK_SNOWFLAKE_PORT || 4567);

/** In-memory analytical tables (OLAP-style — not transactional like MongoDB). */
const store = {
  REVIEWS_ANALYTICS: [],
  PROCESSING_METRICS: [],
  OVERRIDE_EVENTS: [],
};

/** Parse JSON body from incoming HTTP requests. */
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

/** Send JSON HTTP response with consistent content-type. */
function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

/**
 * Derive a deterministic pseudo-confidence from review id (mock model score).
 * Real deployments would store LLM/rule-engine confidence on the Mongo document.
 */
function mockConfidence(reviewId) {
  const hash = crypto.createHash("sha256").update(String(reviewId)).digest();
  return 0.55 + (hash[0] / 255) * 0.44;
}

/** Filter rows whose exported_at or updated_at falls within optional ISO range. */
function filterByRange(rows, from, to, field = "exported_at") {
  const fromMs = from ? Date.parse(from) : null;
  const toMs = to ? Date.parse(to) : null;
  return rows.filter((row) => {
    const ts = Date.parse(row[field] || row.updated_at || row.exported_at || "");
    if (Number.isNaN(ts)) {
      return true;
    }
    if (fromMs != null && ts < fromMs) {
      return false;
    }
    if (toMs != null && ts > toMs) {
      return false;
    }
    return true;
  });
}

/** Aggregate verdict counts for dashboard queries. */
function verdictDistribution(rows) {
  const counts = {};
  rows.forEach((row) => {
    const key = row.effective_verdict || row.automated_verdict || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  });
  return Object.entries(counts).map(([verdict, count]) => ({ verdict, count }));
}

/** Compute override rate: overrides / completed reviews in range. */
function overrideRate(rows) {
  const completed = rows.length;
  const overrides = rows.filter((r) => r.has_override).length;
  return {
    completed,
    overrides,
    overrideRate: completed ? overrides / completed : 0,
  };
}

/** Average processing duration in milliseconds. */
function processingStats(metricRows) {
  if (!metricRows.length) {
    return { avgMs: 0, p95Ms: 0, sampleSize: 0 };
  }
  const durations = metricRows.map((r) => Number(r.processing_ms || 0)).sort((a, b) => a - b);
  const sum = durations.reduce((acc, n) => acc + n, 0);
  const p95Index = Math.min(durations.length - 1, Math.floor(durations.length * 0.95));
  return {
    avgMs: Math.round(sum / durations.length),
    p95Ms: durations[p95Index],
    sampleSize: durations.length,
  };
}

/** Phishing trend buckets by day (count of likely_phishing + suspicious). */
function phishingTrends(rows) {
  const buckets = {};
  rows.forEach((row) => {
    const day = String(row.exported_at || "").slice(0, 10);
    if (!day) {
      return;
    }
    const risky = ["suspicious", "likely_phishing"].includes(row.effective_verdict);
    if (!buckets[day]) {
      buckets[day] = { date: day, riskyCount: 0, total: 0 };
    }
    buckets[day].total += 1;
    if (risky) {
      buckets[day].riskyCount += 1;
    }
  });
  return Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date));
}

/** HTTP router for mock Snowflake endpoints. */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);

  if (req.method === "GET" && url.pathname === "/health") {
    return sendJson(res, 200, { status: "ok", service: "mock-aws-snowflake", tables: Object.keys(store) });
  }

  if (req.method === "GET" && url.pathname === "/v1/status") {
    return sendJson(res, 200, {
      account: "mock_account",
      warehouse: "ANALYTICS_WH",
      database: "TRIAGE_ANALYTICS",
      schema: "PUBLIC",
      rowCounts: Object.fromEntries(
        Object.entries(store).map(([table, rows]) => [table, rows.length])
      ),
    });
  }

  if (req.method === "POST" && url.pathname === "/v1/data/insert") {
    try {
      const body = await readJsonBody(req);
      const table = String(body.table || "").toUpperCase();
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!store[table]) {
        return sendJson(res, 400, { error: "unknown_table", table });
      }
      rows.forEach((row) => {
        const enriched = {
          ...row,
          confidence_score: row.confidence_score ?? mockConfidence(row.review_id),
          exported_at: row.exported_at || new Date().toISOString(),
        };
        const idx = store[table].findIndex((r) => r.review_id === enriched.review_id);
        if (idx >= 0) {
          store[table][idx] = enriched;
        } else {
          store[table].push(enriched);
        }
      });
      return sendJson(res, 200, { inserted: rows.length, table, total: store[table].length });
    } catch (err) {
      return sendJson(res, 400, { error: "invalid_json", message: err.message });
    }
  }

  if (req.method === "POST" && url.pathname === "/v1/data/clear") {
    Object.keys(store).forEach((key) => {
      store[key] = [];
    });
    return sendJson(res, 200, { cleared: true });
  }

  if (req.method === "GET" && url.pathname === "/v1/analytics/verdict-distribution") {
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const rows = filterByRange(store.REVIEWS_ANALYTICS, from, to);
    return sendJson(res, 200, { from, to, distribution: verdictDistribution(rows) });
  }

  if (req.method === "GET" && url.pathname === "/v1/analytics/override-rate") {
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const rows = filterByRange(store.REVIEWS_ANALYTICS, from, to);
    return sendJson(res, 200, { from, to, ...overrideRate(rows) });
  }

  if (req.method === "GET" && url.pathname === "/v1/analytics/processing-stats") {
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const rows = filterByRange(store.PROCESSING_METRICS, from, to, "recorded_at");
    return sendJson(res, 200, { from, to, ...processingStats(rows) });
  }

  if (req.method === "GET" && url.pathname === "/v1/analytics/phishing-trends") {
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const rows = filterByRange(store.REVIEWS_ANALYTICS, from, to);
    return sendJson(res, 200, { from, to, trends: phishingTrends(rows) });
  }

  if (req.method === "GET" && url.pathname === "/v1/analytics/model-performance") {
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const rows = filterByRange(store.REVIEWS_ANALYTICS, from, to);
    const withOverride = rows.filter((r) => r.has_override);
    const agreement = rows.length - withOverride.length;
    return sendJson(res, 200, {
      from,
      to,
      totalReviews: rows.length,
      analystOverrides: withOverride.length,
      automatedAgreementRate: rows.length ? agreement / rows.length : 1,
      avgConfidence:
        rows.length ?
          rows.reduce((acc, r) => acc + Number(r.confidence_score || 0), 0) / rows.length
        : 0,
    });
  }

  return sendJson(res, 404, { error: "not_found", path: url.pathname });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`mock-aws-snowflake listening on :${PORT}`);
});
