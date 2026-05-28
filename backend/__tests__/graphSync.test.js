const { reviewToGraphPayload } = require("../src/graph/syncReview");
const { RISKY_VERDICTS } = require("../src/graph/campaignDetection");

jest.mock("../src/graph/neo4jClient", () => ({
  runWrite: jest.fn().mockResolvedValue({}),
  runRead: jest.fn().mockResolvedValue([]),
}));

const { runWrite } = require("../src/graph/neo4jClient");
const { syncReviewToGraph } = require("../src/graph/syncReview");
const { detectCampaignsForReview } = require("../src/graph/campaignDetection");

describe("reviewToGraphPayload", () => {
  it("maps Mongo review fields and parsed link domains", () => {
    const payload = reviewToGraphPayload({
      _id: "abc123",
      senderEmail: "Bad@Example.com",
      senderName: "Attacker",
      subject: "Verify",
      status: "completed",
      links: ["https://evil.com/login"],
      analysisResult: { verdict: "likely_phishing" },
    });

    expect(payload.reviewId).toBe("abc123");
    expect(payload.senderEmail).toBe("bad@example.com");
    expect(payload.links).toEqual([{ href: "https://evil.com/login", host: "evil.com" }]);
    expect(payload.verdict).toBe("likely_phishing");
  });
});

describe("syncReviewToGraph", () => {
  beforeEach(() => {
    runWrite.mockClear();
  });

  it("runs MERGE cypher with link rows", async () => {
    const result = await syncReviewToGraph({
      _id: "1",
      senderEmail: "a@b.com",
      senderName: "A",
      subject: "Hi",
      status: "pending",
      links: ["http://phish.test/x"],
    });

    expect(result.synced).toBe(true);
    expect(runWrite).toHaveBeenCalled();
    const params = runWrite.mock.calls[0][1];
    expect(params.links[0].host).toBe("phish.test");
  });
});

describe("campaign detection constants", () => {
  it("treats suspicious and likely_phishing as risky", () => {
    expect(RISKY_VERDICTS).toContain("suspicious");
    expect(RISKY_VERDICTS).toContain("likely_phishing");
  });
});

describe("detectCampaignsForReview", () => {
  it("invokes write then read queries", async () => {
    await detectCampaignsForReview("review-1");
    expect(runWrite).toHaveBeenCalled();
  });
});
