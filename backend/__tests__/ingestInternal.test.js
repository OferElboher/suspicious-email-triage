/**
 * Unit tests for POST /ingest/internal/mailbox — Go ingest-gateway → Node persistence path.
 * Mocks Review.create and pipeline side effects so MongoDB/Kafka are not required.
 */
jest.mock("../src/services/reviewPipeline", () => ({
  enqueueAfterCreate: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../src/services/graphSyncService", () => ({
  scheduleGraphSync: jest.fn(),
}));
jest.mock("../src/services/reviewSearchSync", () => ({
  scheduleSearchIndex: jest.fn(),
}));
jest.mock("../src/lib/appMetrics", () => ({
  incrementReviewsCreated: jest.fn(),
}));
jest.mock("../src/ingest/ingestClientsPg", () => ({
  getIngestClient: jest.fn(),
  listIngestClients: jest.fn(),
  upsertIngestClient: jest.fn(),
  ensureIngestClientsSchema: jest.fn(),
}));
jest.mock("../src/lib/logger", () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

const request = require("supertest");
const express = require("express");
const ingestInternalRoutes = require("../src/api/ingestInternal");
const Review = require("../src/models/Review");
const { enqueueAfterCreate } = require("../src/services/reviewPipeline");
const { getIngestClient, listIngestClients, upsertIngestClient } = require("../src/ingest/ingestClientsPg");
const logger = require("../src/lib/logger");

/** Build minimal Express app mounting only internal ingest routes (no JWT). */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/ingest/internal", ingestInternalRoutes);
  return app;
}

describe("ingest internal mailbox API", () => {
  const app = buildApp();

  beforeEach(() => {
    process.env.INGEST_INTERNAL_TOKEN = "test-ingest-token";
    Review.create = jest.fn().mockResolvedValue({
      _id: { toString: () => "507f1f77bcf86cd799439011" },
      status: "pending",
    });
    enqueueAfterCreate.mockClear();
    getIngestClient.mockResolvedValue({
      client_id: "dev-mock",
      callback_url: "http://mock.test/webhook",
      is_active: true,
    });
    listIngestClients.mockResolvedValue([]);
    upsertIngestClient.mockResolvedValue({
      client_id: "acme-graph",
      display_name: "Acme",
      callback_url: "https://seg.example/hook",
      is_active: true,
    });
  });

  it("rejects missing internal token", async () => {
    const res = await request(app).post("/ingest/internal/mailbox").send({
      senderEmail: "a@example.com",
      subject: "hi",
      body: "body",
    });
    expect(res.status).toBe(401);
  });

  it("creates mailbox_ingest review with valid token", async () => {
    const res = await request(app)
      .post("/ingest/internal/mailbox")
      .set("X-Ingest-Internal-Token", "test-ingest-token")
      .send({
        senderName: "Gateway Test",
        senderEmail: "gateway@example.com",
        subject: "Ingest test",
        body: "Hello from Go gateway test",
        source: "mailbox_ingest",
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.status).toBe("pending");
    expect(Review.create).toHaveBeenCalled();
    expect(enqueueAfterCreate).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      "ingest",
      "internal mailbox review created",
      expect.objectContaining({ source: "mailbox_ingest" })
    );
  });

  it("persists externalMessageId and callbackUrl on ingest", async () => {
    Review.create = jest.fn().mockResolvedValue({
      _id: { toString: () => "507f1f77bcf86cd799439011" },
      status: "pending",
      externalMessageId: "graph-msg-99",
    });
    const res = await request(app)
      .post("/ingest/internal/mailbox")
      .set("X-Ingest-Internal-Token", "test-ingest-token")
      .send({
        senderEmail: "a@example.com",
        subject: "hi",
        body: "body",
        source: "mailbox_ingest",
        externalMessageId: "graph-msg-99",
        callbackUrl: "http://customer.example/webhook",
      });
    expect(res.status).toBe(201);
    expect(Review.create).toHaveBeenCalledWith(
      expect.objectContaining({
        externalMessageId: "graph-msg-99",
        callbackUrl: "http://customer.example/webhook",
      })
    );
    expect(res.body.externalMessageId).toBe("graph-msg-99");
  });

  it("GET /verdict/:id returns poll payload for mail platforms", async () => {
    Review.findById = jest.fn().mockResolvedValue({
      _id: { toString: () => "507f1f77bcf86cd799439011" },
      externalMessageId: "ext-42",
      status: "completed",
      analysisResult: { verdict: "suspicious", recommendedAction: "investigate" },
      override: null,
      verdictDelivery: { status: "delivered" },
      updatedAt: new Date("2026-08-01T12:00:00Z"),
      toObject() {
        return this;
      },
    });
    const res = await request(app)
      .get("/ingest/internal/verdict/507f1f77bcf86cd799439011")
      .set("X-Ingest-Internal-Token", "test-ingest-token");
    expect(res.status).toBe(200);
    expect(res.body.externalMessageId).toBe("ext-42");
    expect(res.body.verdict).toBe("suspicious");
  });

  it("rejects unknown ingestClientId", async () => {
    getIngestClient.mockResolvedValue(null);
    const res = await request(app)
      .post("/ingest/internal/mailbox")
      .set("X-Ingest-Internal-Token", "test-ingest-token")
      .send({
        senderEmail: "a@example.com",
        subject: "hi",
        body: "body",
        ingestClientId: "missing-client",
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("unknown_ingest_client");
    expect(Review.create).not.toHaveBeenCalled();
  });

  it("persists ingestClientId when client is registered", async () => {
    Review.create = jest.fn().mockResolvedValue({
      _id: { toString: () => "507f1f77bcf86cd799439011" },
      status: "pending",
      ingestClientId: "dev-mock",
    });
    const res = await request(app)
      .post("/ingest/internal/mailbox")
      .set("X-Ingest-Internal-Token", "test-ingest-token")
      .set("X-Ingest-Client-Id", "dev-mock")
      .send({
        senderEmail: "a@example.com",
        subject: "hi",
        body: "body",
      });
    expect(res.status).toBe(201);
    expect(Review.create).toHaveBeenCalledWith(
      expect.objectContaining({ ingestClientId: "dev-mock" })
    );
    expect(res.body.ingestClientId).toBe("dev-mock");
  });

  it("GET /clients lists registered mail platforms", async () => {
    listIngestClients.mockResolvedValue([
      { client_id: "dev-mock", display_name: "Dev", callback_url: "http://mock.test/hook" },
    ]);
    const res = await request(app)
      .get("/ingest/internal/clients")
      .set("X-Ingest-Internal-Token", "test-ingest-token");
    expect(res.status).toBe(200);
    expect(res.body.clients).toHaveLength(1);
  });

  it("PUT /clients/:clientId upserts mail platform webhook default", async () => {
    const res = await request(app)
      .put("/ingest/internal/clients/acme-graph")
      .set("X-Ingest-Internal-Token", "test-ingest-token")
      .send({
        displayName: "Acme Graph",
        callbackUrl: "https://seg.example/hook",
      });
    expect(res.status).toBe(200);
    expect(upsertIngestClient).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "acme-graph",
        callbackUrl: "https://seg.example/hook",
      })
    );
  });

  it("rejects invalid source value", async () => {
    const res = await request(app)
      .post("/ingest/internal/mailbox")
      .set("X-Ingest-Internal-Token", "test-ingest-token")
      .send({
        senderEmail: "a@example.com",
        subject: "hi",
        body: "body",
        source: "user",
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_source");
  });
});
