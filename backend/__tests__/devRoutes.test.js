/**
 * HTTP tests for /dev/* capability flags and role gates (admin vs developer).
 * Technology: supertest + Express mini-app; heavy I/O mocked so Jest stays offline.
 */
jest.mock("../src/stats/statsPg", () => ({
  resetStats: jest.fn(async () => {}),
}));

jest.mock("../src/models/Review", () => ({
  findById: jest.fn(),
  deleteMany: jest.fn(async () => ({ deletedCount: 0 })),
}));

jest.mock("../src/lib/getRedis", () => ({
  getRedis: jest.fn(() => ({ flushall: jest.fn(async () => "OK") })),
}));

jest.mock("../src/graph/neo4jClient", () => ({
  resetGraph: jest.fn(async () => true),
}));

jest.mock("../src/kafka/reviewIngestProducer", () => ({
  publishReviewIngested: jest.fn(async () => {}),
}));

jest.mock("../src/analytics/snowflakeClient", () => ({
  clearAnalyticsTables: jest.fn(async () => ({ ok: true })),
}));

jest.mock("kafkajs", () => ({
  Kafka: jest.fn(() => ({
    admin: jest.fn(() => ({
      connect: jest.fn(async () => {}),
      listTopics: jest.fn(async () => []),
      createTopics: jest.fn(async () => {}),
      deleteTopics: jest.fn(async () => {}),
      disconnect: jest.fn(async () => {}),
    })),
  })),
  logLevel: { NOTHING: 0 },
}));

jest.mock("../src/config/runtime", () => ({
  isDevDeployment: jest.fn(() => true),
  kafkaBrokers: jest.fn(() => ["localhost:9092"]),
  kafkaTopicIngest: "email.review.ingested",
  kafkaTopicDlq: "email.review.ingested.dlq",
  kafkaTopicPartitions: jest.fn(() => 1),
}));

jest.mock("../src/http/middleware/auth", () => ({
  requirePermission:
    (...required) =>
    (req, res, next) => {
      const granted = new Set(req.auth?.permissions || []);
      if (!required.some((p) => granted.has(p))) {
        return res.status(403).json({ error: "forbidden" });
      }
      return next();
    },
  hasPermission: (auth, code) => (auth?.permissions || []).includes(code),
}));

jest.mock("../src/dev/simulationStore", () => ({
  writeSimulation: jest.fn(async (body) => body),
  readSimulation: jest.fn(async () => ({ enabled: false, eventsPerMinute: 1 })),
  MAX_EVENTS_PER_MIN: 30,
}));

jest.mock("../src/dev/simulationLoop", () => ({
  applySimulationFromStore: jest.fn(async () => {}),
  clearLoop: jest.fn(),
}));

jest.mock("../src/graph/graphMaintenance", () => ({
  pruneOrphanGraphNodes: jest.fn(async () => ({
    deletedOrphans: 0,
    deletedEmptyCampaigns: 0,
    mergedSenders: 0,
    mergedUrls: 0,
    mergedDomains: 0,
  })),
}));

const request = require("supertest");
const express = require("express");
const devRoutes = require("../src/dev/devRoutes");
const { isDevDeployment } = require("../src/config/runtime");
const { readSimulation } = require("../src/dev/simulationStore");

/** Mount dev router with injected JWT auth payload for each test case. */
function buildApp(auth) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = auth;
    next();
  });
  app.use("/dev", devRoutes);
  return app;
}

const adminAuth = {
  email: "admin@test.local",
  roles: ["admin"],
  permissions: ["dev.simulation", "dev.reset", "metrics.read"],
};

const developerAuth = {
  email: "dev@test.local",
  roles: ["developer"],
  permissions: ["dev.simulation", "dev.reset"],
};

const analystAuth = {
  email: "analyst@test.local",
  roles: ["analyst"],
  permissions: ["reviews.read"],
};

describe("dev routes — feature flags and role gates", () => {
  beforeEach(() => {
    isDevDeployment.mockReturnValue(true);
  });

  it("GET /dev/features enables simulation and reset for admin in dev", async () => {
    const res = await request(buildApp(adminAuth)).get("/dev/features");
    expect(res.status).toBe(200);
    expect(res.body.simulation).toBe(true);
    expect(res.body.resetLocalState).toBe(true);
    expect(res.body.deployment).toBe("dev");
  });

  it("GET /dev/features enables simulation for developer role", async () => {
    const res = await request(buildApp(developerAuth)).get("/dev/features");
    expect(res.status).toBe(200);
    expect(res.body.simulation).toBe(true);
  });

  it("GET /dev/features hides simulation for analyst without dev permissions", async () => {
    const res = await request(buildApp(analystAuth)).get("/dev/features");
    expect(res.status).toBe(200);
    expect(res.body.simulation).toBe(false);
    expect(res.body.resetLocalState).toBe(false);
  });

  it("GET /dev/simulation allows admin with dev.simulation permission", async () => {
    const res = await request(buildApp(adminAuth)).get("/dev/simulation");
    expect(res.status).toBe(200);
    expect(readSimulation).toHaveBeenCalled();
    expect(res.body.simulation).toEqual({ enabled: false, eventsPerMinute: 1 });
  });

  it("GET /dev/simulation rejects analyst without permission", async () => {
    const res = await request(buildApp(analystAuth)).get("/dev/simulation");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("forbidden");
  });

  it("POST /dev/prune-graph rejects analyst even with dev.reset missing", async () => {
    const res = await request(buildApp(analystAuth)).post("/dev/prune-graph");
    expect(res.status).toBe(403);
  });

  it("POST /dev/prune-graph succeeds for admin", async () => {
    const res = await request(buildApp(adminAuth)).post("/dev/prune-graph");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
