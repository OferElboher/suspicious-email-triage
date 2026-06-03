jest.mock("../src/graph/neo4jClient", () => ({
  runWrite: jest.fn().mockResolvedValue({}),
  runRead: jest.fn(),
}));

const { runWrite, runRead } = require("../src/graph/neo4jClient");
const {
  RISKY_VERDICTS,
  detectCampaignsForReview,
  listCampaigns,
  isRiskyVerdict,
} = require("../src/graph/campaignDetection");

/** Build a mock Neo4j record (driver Record-like get()). */
function mockRecord(fields) {
  return {
    get: (key) => fields[key],
  };
}

describe("isRiskyVerdict", () => {
  it("returns true only for suspicious and likely_phishing", () => {
    expect(isRiskyVerdict("likely_phishing")).toBe(true);
    expect(isRiskyVerdict("suspicious")).toBe(true);
    expect(isRiskyVerdict("benign")).toBe(false);
    expect(isRiskyVerdict(null)).toBe(false);
  });
});

describe("detectCampaignsForReview", () => {
  beforeEach(() => {
    runWrite.mockClear();
    runRead.mockReset();
  });

  it("runs global campaign MERGE then reads campaigns for the review", async () => {
    runRead.mockResolvedValueOnce([
      mockRecord({
        indicator: "secure-login.example-phish.test",
        reviewCount: 2,
        kind: "shared_domain",
      }),
    ]);

    const campaigns = await detectCampaignsForReview("review-a");

    expect(runWrite).toHaveBeenCalledTimes(1);
    const writeParams = runWrite.mock.calls[0][1];
    expect(writeParams.riskyVerdicts).toEqual(RISKY_VERDICTS);
    expect(campaigns).toHaveLength(1);
    expect(campaigns[0].indicator).toBe("secure-login.example-phish.test");
    expect(campaigns[0].reviewCount).toBe(2);
  });
});

describe("listCampaigns", () => {
  it("maps Neo4j rows to API campaign objects", async () => {
    runRead.mockResolvedValueOnce([
      mockRecord({
        indicator: "evil.com",
        kind: "shared_domain",
        reviewCount: 3,
        reviewIds: ["id1", "id2", "id3"],
      }),
    ]);

    const list = await listCampaigns(10);
    expect(list[0].indicator).toBe("evil.com");
    expect(list[0].reviewCount).toBe(3);
    expect(list[0].reviewIds).toEqual(["id1", "id2", "id3"]);
  });
});
