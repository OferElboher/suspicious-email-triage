jest.mock("../src/search/elasticClient", () => ({
  isElasticsearchEnabled: jest.fn(() => true),
  getElasticsearchClient: jest.fn(),
  resetElasticsearchClient: jest.fn(),
}));

const { getElasticsearchClient } = require("../src/search/elasticClient");
const {
  reviewToSearchDocument,
  indexReviewDocument,
  clearReviewIndex,
  searchReviews,
} = require("../src/search/reviewSearchIndex");

describe("review search index", () => {
  it("maps Mongo review fields to Elasticsearch document shape", () => {
    const doc = reviewToSearchDocument({
      _id: "abc",
      senderEmail: "A@B.com",
      subject: "Hello",
      body: "text",
      status: "completed",
      links: ["http://x.com"],
      analysisResult: { verdict: "suspicious" },
    });
    expect(doc.reviewId).toBe("abc");
    expect(doc.senderEmail).toBe("a@b.com");
    expect(doc.verdict).toBe("suspicious");
  });

  it("indexes document when client is available", async () => {
    const index = jest.fn().mockResolvedValue({});
    const exists = jest.fn().mockResolvedValue(false);
    const create = jest.fn().mockResolvedValue({});
    getElasticsearchClient.mockResolvedValue({
      indices: { exists, create },
      index,
    });

    const result = await indexReviewDocument({
      _id: "1",
      senderEmail: "u@x.com",
      senderName: "U",
      subject: "S",
      body: "B",
      status: "pending",
    });

    expect(result.indexed).toBe(true);
    expect(index).toHaveBeenCalled();
  });

  it("clearReviewIndex deletes and recreates index", async () => {
    const del = jest.fn().mockResolvedValue({});
    const exists = jest.fn().mockResolvedValue(true);
    const create = jest.fn().mockResolvedValue({});
    getElasticsearchClient.mockResolvedValue({
      indices: { exists, delete: del, create },
    });

    const result = await clearReviewIndex();
    expect(result.cleared).toBe(true);
    expect(del).toHaveBeenCalled();
  });

  it("searchReviews builds bool query with verdict and date filters", async () => {
    const search = jest.fn().mockResolvedValue({
      hits: { hits: [], total: { value: 0 } },
    });
    const exists = jest.fn().mockResolvedValue(true);
    getElasticsearchClient.mockResolvedValue({
      indices: { exists },
      search,
    });

    await searchReviews({
      query: "phish",
      verdict: "likely_phishing",
      updatedFrom: "2026-06-01T00:00:00Z",
      subjectRegex: ".*verify.*",
    });

    expect(search).toHaveBeenCalled();
    const body = search.mock.calls[0][0];
    expect(body.query.bool.must[0].multi_match.query).toBe("phish");
    expect(body.query.bool.filter.some((f) => f.term?.verdict === "likely_phishing")).toBe(true);
    expect(body.query.bool.filter.some((f) => f.regexp?.subject)).toBe(true);
  });
});
