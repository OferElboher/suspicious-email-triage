jest.mock("../src/graph/campaignDetection", () => ({
  listCampaigns: jest.fn().mockResolvedValue([{ indicator: "evil.com", reviewCount: 2 }]),
}));

jest.mock("../src/graph/graphQueries", () => ({
  getReviewNeighborhood: jest.fn().mockResolvedValue({ nodes: [], edges: [] }),
  getVisualizationGraph: jest.fn().mockResolvedValue({ nodes: [], edges: [], stats: {} }),
}));

jest.mock("../src/graph/neo4jClient", () => ({
  isNeo4jEnabled: jest.fn().mockReturnValue(true),
}));

const request = require("supertest");
const express = require("express");
const graphRoutes = require("../src/api/graph");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = { email: "test@local.test", permissions: ["graph.read"] };
    next();
  });
  app.use("/graph", graphRoutes);
  return app;
}

describe("graph API routes", () => {
  const app = buildApp();

  it("GET /graph/status returns enabled flag", async () => {
    const res = await request(app).get("/graph/status");
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
  });

  it("GET /graph/campaigns returns campaign list", async () => {
    const res = await request(app).get("/graph/campaigns");
    expect(res.status).toBe(200);
    expect(res.body.campaigns[0].indicator).toBe("evil.com");
  });
});
