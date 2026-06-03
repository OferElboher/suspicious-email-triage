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
});
