jest.mock("../src/graph/graphQueries", () => ({
  getReviewNeighborhood: jest.fn().mockResolvedValue({ nodes: [], edges: [{ type: "SENT_BY" }] }),
}));

jest.mock("../src/models/Review", () => ({
  findById: jest.fn(),
  find: jest.fn(),
}));

const request = require("supertest");
const express = require("express");
const agentInternalRoutes = require("../src/api/agentInternal");
const Review = require("../src/models/Review");
const { getReviewNeighborhood } = require("../src/graph/graphQueries");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/agent/internal", agentInternalRoutes);
  return app;
}

describe("agent internal API", () => {
  const app = buildApp();

  beforeEach(() => {
    process.env.AGENT_INTERNAL_SERVICE_TOKEN = "dev-agent-internal-token";
    Review.findById.mockReset();
    Review.find.mockReset();
    getReviewNeighborhood.mockClear();
  });

  it("rejects missing agent service token", async () => {
    const res = await request(app).get("/agent/internal/sender-history?email=a@test.com");
    expect(res.status).toBe(401);
  });

  it("returns sender history with valid token", async () => {
    const chain = {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([{ _id: "1", senderEmail: "a@test.com" }]),
    };
    Review.find.mockReturnValue(chain);

    const res = await request(app)
      .get("/agent/internal/sender-history?email=a@test.com")
      .set("X-Agent-Internal-Token", "dev-agent-internal-token");

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(Review.find).toHaveBeenCalledWith({ senderEmail: "a@test.com" });
  });

  it("returns graph neighborhood for agent tool", async () => {
    const res = await request(app)
      .get("/agent/internal/graph/review/abc/neighborhood?depth=1")
      .set("X-Agent-Internal-Token", "dev-agent-internal-token");

    expect(res.status).toBe(200);
    expect(res.body.edges).toHaveLength(1);
    expect(getReviewNeighborhood).toHaveBeenCalledWith("abc", 1);
  });
});
