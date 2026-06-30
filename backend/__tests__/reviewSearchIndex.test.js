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
  pageForDateSearch,
  parseEsTotalHits,
  computeSearchHasMore,
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
    expect(doc.status).toBe("completed");
  });

  it("parseEsTotalHits reads object, number, and fallback shapes", () => {
    expect(parseEsTotalHits({ value: 10000, relation: "gte" }, 20)).toEqual({
      total: 10000,
      relation: "gte",
    });
    expect(parseEsTotalHits(45, 20)).toEqual({ total: 45, relation: "eq" });
    expect(parseEsTotalHits(undefined, 7)).toEqual({ total: 7, relation: "eq" });
  });

  it("computeSearchHasMore is true for full page when ES total is gte capped", () => {
    expect(
      computeSearchHasMore({
        hitsLength: 20,
        size: 20,
        offset: 0,
        total: 10000,
        relation: "gte",
      })
    ).toBe(true);
  });

  it("normalizes verdict to lowercase for keyword term filters", () => {
    const doc = reviewToSearchDocument({
      _id: "x",
      status: "Completed",
      analysisResult: { verdict: "Benign" },
    });
    expect(doc.verdict).toBe("benign");
    expect(doc.status).toBe("completed");
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
      hits: {
        hits: Array.from({ length: 20 }, (_, i) => ({
          _id: String(i),
          _source: { subject: "s" },
        })),
        total: { value: 10000, relation: "gte" },
      },
    });
    const exists = jest.fn().mockResolvedValue(true);
    getElasticsearchClient.mockResolvedValue({
      indices: { exists },
      search,
    });

    const result = await searchReviews({
      query: "phish",
      verdict: "likely_phishing",
      updatedFrom: "2026-06-01T00:00:00Z",
      subjectRegex: ".*verify.*",
    });

    expect(search).toHaveBeenCalled();
    const body = search.mock.calls[0][0];
    expect(body.track_total_hits).toBe(true);
    expect(body.query.bool.must[0].multi_match.query).toBe("phish");
    expect(body.query.bool.filter.some((f) => f.term?.verdict === "likely_phishing")).toBe(true);
    expect(body.query.bool.filter.some((f) => f.regexp?.subject)).toBe(true);
    expect(result.hasMore).toBe(true);
    expect(result.totalRelation).toBe("gte");
  });

  it("pageForDateSearch counts on-day and newer docs for page index", async () => {
    const count = jest
      .fn()
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 40 });
    const exists = jest.fn().mockResolvedValue(true);
    getElasticsearchClient.mockResolvedValue({
      indices: { exists },
      count,
    });

    const result = await pageForDateSearch({
      date: "2026-06-10",
      limit: 20,
      query: "phish",
    });

    expect(result.page).toBe(2);
    expect(result.onDayCount).toBe(2);
    expect(count).toHaveBeenCalledTimes(2);
    const onDayQuery = count.mock.calls[0][0].query;
    const dayRange = onDayQuery.bool.filter.find((f) => f.range?.updatedAt);
    expect(dayRange.range.updatedAt.gte).toMatch(/2026-06-10T00:00:00.000Z/);
    expect(dayRange.range.updatedAt.lte).toMatch(/2026-06-10T23:59:59.999Z/);
  });
});
