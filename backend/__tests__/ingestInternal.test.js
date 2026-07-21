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

const request = require("supertest");
const express = require("express");
const ingestInternalRoutes = require("../src/api/ingestInternal");
const Review = require("../src/models/Review");
const { enqueueAfterCreate } = require("../src/services/reviewPipeline");

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
