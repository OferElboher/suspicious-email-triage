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
jest.mock("../src/models/Review", () => ({
  countDocuments: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
}));

const request = require("supertest");
const express = require("express");
const Review = require("../src/models/Review");
const reviewsRoutes = require("../src/api/reviews");

/** Mount reviews router with synthetic auth context. */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.auth = { email: "test@local.test", permissions: ["reviews.read", "reviews.write"] };
    next();
  });
  app.use("/reviews", reviewsRoutes);
  return app;
}

describe("GET /reviews", () => {
  const app = buildApp();

  beforeEach(() => {
    Review.countDocuments.mockReset();
    Review.find.mockReset();
  });

  it("excludes dev_simulation rows by default", async () => {
    Review.countDocuments.mockResolvedValue(1);
    const chain = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue([
        { _id: "u1", subject: "Real", senderEmail: "a@b.com", source: "user" },
      ]),
    };
    Review.find.mockReturnValue(chain);

    const res = await request(app).get("/reviews");
    expect(res.status).toBe(200);
    expect(Review.find).toHaveBeenCalledWith({ source: { $ne: "dev_simulation" } });
    expect(res.body.data).toHaveLength(1);
  });

  it("includes simulation rows when includeSimulation=true", async () => {
    Review.countDocuments.mockResolvedValue(2);
    const chain = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue([
        { _id: "s1", subject: "Simulated ingest", source: "dev_simulation" },
        { _id: "u1", subject: "Real", source: "user" },
      ]),
    };
    Review.find.mockReturnValue(chain);

    const res = await request(app).get("/reviews?includeSimulation=true");
    expect(res.status).toBe(200);
    expect(Review.find).toHaveBeenCalledWith({});
    expect(res.body.data).toHaveLength(2);
  });
});
