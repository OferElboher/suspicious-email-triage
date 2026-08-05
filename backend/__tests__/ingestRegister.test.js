/**
 * Unit tests for mail platform self-registration (PUT /ingest/register/:clientId).
 */
jest.mock("../src/ingest/ingestClientsPg", () => ({
  upsertIngestClient: jest.fn(),
  getIngestClient: jest.fn(),
  listIngestClients: jest.fn(),
  ensureIngestClientsSchema: jest.fn(),
}));

const request = require("supertest");
const express = require("express");
const ingestRegisterRoutes = require("../src/api/ingestRegister");
const { upsertIngestClient } = require("../src/ingest/ingestClientsPg");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/ingest", ingestRegisterRoutes);
  return app;
}

describe("ingest self-registration API", () => {
  const app = buildApp();

  beforeEach(() => {
    process.env.INGEST_CLIENT_REGISTRATION_TOKEN = "test-registration-token";
    upsertIngestClient.mockResolvedValue({
      client_id: "acme-graph",
      display_name: "Acme Graph",
      callback_url: "https://seg.example/hook",
      is_active: true,
    });
  });

  afterEach(() => {
    delete process.env.INGEST_CLIENT_REGISTRATION_TOKEN;
  });

  it("rejects missing registration token", async () => {
    const res = await request(app)
      .put("/ingest/register/acme-graph")
      .send({ displayName: "Acme", callbackUrl: "https://seg.example/hook" });
    expect(res.status).toBe(401);
  });

  it("registers client with valid registration token", async () => {
    const res = await request(app)
      .put("/ingest/register/acme-graph")
      .set("X-Ingest-Registration-Token", "test-registration-token")
      .send({
        displayName: "Acme Graph adapter",
        callbackUrl: "https://seg.example/hook",
      });
    expect(res.status).toBe(200);
    expect(res.body.client.clientId).toBe("acme-graph");
    expect(upsertIngestClient).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "acme-graph",
        callbackUrl: "https://seg.example/hook",
      })
    );
  });
});
