/**
 * Unit tests for JWT-authenticated ingest client registry routes.
 */
jest.mock("../src/ingest/ingestClientsPg", () => ({
  listIngestClients: jest.fn(),
  upsertIngestClient: jest.fn(),
  getIngestClient: jest.fn(),
  ensureIngestClientsSchema: jest.fn(),
}));

const request = require("supertest");
const express = require("express");
const ingestClientsRoutes = require("../src/api/ingestClients");
const { listIngestClients, upsertIngestClient } = require("../src/ingest/ingestClientsPg");

function buildApp({ permissions = ["ingest.clients.write", "metrics.read"] } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = { email: "admin@example.com", roles: ["admin"], permissions };
    next();
  });
  app.use("/ingest/clients", ingestClientsRoutes);
  return app;
}

describe("ingest clients JWT API", () => {
  beforeEach(() => {
    listIngestClients.mockResolvedValue([
      {
        client_id: "dev-mock",
        display_name: "Dev mock",
        callback_url: "http://mock.test/hook",
        is_active: true,
      },
    ]);
    upsertIngestClient.mockResolvedValue({
      client_id: "fabrikam",
      display_name: "Fabrikam",
      callback_url: "https://seg.fabrikam.example/hook",
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    });
  });

  it("GET / lists clients with metrics.read", async () => {
    const app = buildApp({ permissions: ["metrics.read"] });
    const res = await request(app).get("/ingest/clients");
    expect(res.status).toBe(200);
    expect(res.body.clients[0].clientId).toBe("dev-mock");
  });

  it("PUT /:clientId requires ingest.clients.write", async () => {
    const app = buildApp({ permissions: ["metrics.read"] });
    const res = await request(app)
      .put("/ingest/clients/fabrikam")
      .send({ displayName: "Fabrikam", callbackUrl: "https://seg.fabrikam.example/hook" });
    expect(res.status).toBe(403);
  });

  it("PUT /:clientId upserts with ingest.clients.write", async () => {
    const app = buildApp({ permissions: ["ingest.clients.write"] });
    const res = await request(app)
      .put("/ingest/clients/fabrikam")
      .send({ displayName: "Fabrikam", callbackUrl: "https://seg.fabrikam.example/hook" });
    expect(res.status).toBe(200);
    expect(res.body.client.clientId).toBe("fabrikam");
  });
});
