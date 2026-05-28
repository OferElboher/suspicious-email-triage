jest.mock("../src/services/graphSyncService", () => ({
  syncReviewGraphById: jest.fn().mockResolvedValue({ synced: true, reviewId: "abc" }),
}));

const request = require("supertest");
const express = require("express");
const graphInternalRoutes = require("../src/api/graphInternal");
const { syncReviewGraphById } = require("../src/services/graphSyncService");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/graph/internal", graphInternalRoutes);
  return app;
}

describe("graph internal API", () => {
  const app = buildApp();

  beforeEach(() => {
    process.env.GRAPH_INTERNAL_TOKEN = "dev-graph-sync-token";
    syncReviewGraphById.mockClear();
  });

  it("POST /graph/internal/sync rejects missing token", async () => {
    const res = await request(app).post("/graph/internal/sync/abc");
    expect(res.status).toBe(401);
  });

  it("POST /graph/internal/sync accepts service token", async () => {
    const res = await request(app)
      .post("/graph/internal/sync/abc")
      .set("X-Graph-Internal-Token", "dev-graph-sync-token");
    expect(res.status).toBe(200);
    expect(res.body.synced).toBe(true);
    expect(syncReviewGraphById).toHaveBeenCalledWith("abc");
  });
});
