jest.mock("../src/backups/s3BackupProvider", () => ({
  backupProviderMode: jest.fn(() => "mock-aws"),
  backupProviderStatus: jest.fn(() => ({
    enabled: true,
    provider: "mock-aws",
    bucket: "triage-dev-backups",
    endpoint: "http://mock-s3:4568",
  })),
  listBackupObjects: jest.fn(async () => ({
    bucket: "triage-dev-backups",
    prefix: "postgres/",
    items: [{ key: "postgres/logical-2026.json", size: 120, lastModified: "2026-01-01T00:00:00.000Z" }],
  })),
  uploadBackupObject: jest.fn(async ({ key, body }) => ({
    bucket: "triage-dev-backups",
    key,
    size: Buffer.byteLength(body),
  })),
}));

jest.mock("../src/backups/backupService", () => ({
  runPostgresBackupToS3: jest.fn(async () => ({
    bucket: "triage-dev-backups",
    key: "postgres/logical-test.json",
    size: 99,
    summary: { reviewStatsEventCount: 1, authUserCount: 1 },
    createdAt: "2026-01-01T00:00:00.000Z",
  })),
}));

jest.mock("../src/http/middleware/auth", () => ({
  authenticate: (req, res, next) => {
    if (!req.headers.authorization) {
      return res.status(401).json({ error: "authentication_required" });
    }
    req.auth = req.auth || {
      email: "ops@test.local",
      permissions: ["metrics.read", "logs.read", "ops.backups"],
    };
    return next();
  },
  requirePermission:
    (...required) =>
    (req, res, next) => {
      const granted = new Set(req.auth?.permissions || []);
      if (!required.some((p) => granted.has(p))) {
        return res.status(403).json({ error: "forbidden" });
      }
      return next();
    },
}));

jest.mock("../src/lib/appMetrics", () => ({
  renderPrometheusText: jest.fn(() => "triage_http_requests_total 1\n"),
}));

jest.mock("../src/lib/alertEvaluator", () => ({
  evaluateAlerts: jest.fn(async () => ({
    alertCount: 0,
    alerts: [],
    readiness: "ok",
  })),
}));

jest.mock("../src/lib/logSummary", () => ({
  summarizeLogs: jest.fn(async () => ({
    path: "/var/log/triage/merged.log",
    topics: { api: 2 },
    levels: { info: 2 },
    lineCount: 2,
  })),
}));

const request = require("supertest");
const express = require("express");
const opsRoutes = require("../src/api/ops");
const { renderPrometheusText } = require("../src/lib/appMetrics");
const { runPostgresBackupToS3 } = require("../src/backups/backupService");
const { listBackupObjects } = require("../src/backups/s3BackupProvider");

/** Build app with optional permission override on req.auth. */
function buildApp({ permissions } = {}) {
  const app = express();
  app.use(express.json());
  if (permissions) {
    app.use((req, _res, next) => {
      req.auth = { email: "ops@test.local", permissions };
      next();
    });
  }
  app.use("/ops", opsRoutes);
  return app;
}

describe("ops API routes", () => {
  const bearer = { Authorization: "Bearer test" };

  it("GET /ops/prometheus returns text exposition without auth", async () => {
    const app = buildApp();
    const res = await request(app).get("/ops/prometheus");
    expect(res.status).toBe(200);
    expect(res.text).toContain("triage_http_requests_total");
    expect(renderPrometheusText).toHaveBeenCalled();
  });

  it("GET /ops/alerts requires authentication", async () => {
    const app = buildApp();
    const res = await request(app).get("/ops/alerts");
    expect(res.status).toBe(401);
  });

  it("GET /ops/alerts returns JSON for metrics.read", async () => {
    const app = buildApp({ permissions: ["metrics.read"] });
    const res = await request(app).get("/ops/alerts").set(bearer);
    expect(res.status).toBe(200);
    expect(res.body.readiness).toBe("ok");
  });

  it("GET /ops/logs/summary requires logs.read", async () => {
    const app = buildApp({ permissions: ["logs.read"] });
    const res = await request(app).get("/ops/logs/summary").set(bearer);
    expect(res.status).toBe(200);
    expect(res.body.topics).toBeDefined();
  });

  it("GET /ops/backups/status returns S3 provider metadata for ops.backups", async () => {
    const app = buildApp({ permissions: ["ops.backups"] });
    const res = await request(app).get("/ops/backups/status").set(bearer);
    expect(res.status).toBe(200);
    expect(res.body.provider).toBe("mock-aws");
    expect(res.body.bucket).toBe("triage-dev-backups");
  });

  it("GET /ops/backups lists objects for ops.backups", async () => {
    const app = buildApp({ permissions: ["ops.backups"] });
    const res = await request(app).get("/ops/backups").set(bearer);
    expect(res.status).toBe(200);
    expect(listBackupObjects).toHaveBeenCalled();
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it("POST /ops/backups/run triggers logical backup upload", async () => {
    const app = buildApp({ permissions: ["ops.backups"] });
    const res = await request(app).post("/ops/backups/run").set(bearer);
    expect(res.status).toBe(200);
    expect(runPostgresBackupToS3).toHaveBeenCalled();
    expect(res.body.ok).toBe(true);
    expect(res.body.key).toMatch(/^postgres\//);
  });
});
