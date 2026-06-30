jest.mock("../src/http/middleware/auth", () => ({
  authenticate: (req, _res, next) => {
    req.auth = {
      email: "dev@test.local",
      roles: ["developer"],
      permissions: ["reviews.read", "dev.reset"],
    };
    next();
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

jest.mock("../src/search/reviewSearchIndex", () => ({
  getSearchIndexStats: jest.fn(async () => ({
    enabled: true,
    reachable: true,
    index: "triage-reviews",
    documentCount: 2,
  })),
  searchReviews: jest.fn(async () => ({
    enabled: true,
    hits: [],
    total: 0,
    limit: 20,
    offset: 0,
    hasMore: false,
  })),
  pageForDateSearch: jest.fn(async () => ({
    enabled: true,
    date: "2026-06-01",
    page: 0,
    limit: 20,
    onDayCount: 1,
    totalNewer: 0,
  })),
  clearReviewIndex: jest.fn(async () => ({ cleared: true, index: "triage-reviews" })),
}));

const request = require("supertest");
const express = require("express");
const searchRoutes = require("../src/api/search");
const { clearReviewIndex, pageForDateSearch } = require("../src/search/reviewSearchIndex");

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/search", searchRoutes);
  return app;
}

describe("search API routes", () => {
  const app = buildApp();
  const bearer = { Authorization: "Bearer test" };

  it("GET /search/status returns index stats", async () => {
    const res = await request(app).get("/search/status").set(bearer);
    expect(res.status).toBe(200);
    expect(res.body.documentCount).toBe(2);
  });

  it("DELETE /search/index clears index for developer", async () => {
    const res = await request(app).delete("/search/index").set(bearer);
    expect(res.status).toBe(200);
    expect(clearReviewIndex).toHaveBeenCalled();
  });

  it("GET /search/page-for-date returns page index for filtered search", async () => {
    const res = await request(app)
      .get("/search/page-for-date?date=2026-06-01&q=phish&limit=20")
      .set(bearer);
    expect(res.status).toBe(200);
    expect(pageForDateSearch).toHaveBeenCalled();
    expect(res.body.page).toBe(0);
    expect(res.body.onDayCount).toBe(1);
  });
});
