/**
 * Unit tests for Neo4j graph housekeeping (duplicate merge + orphan prune).
 * Technology: Jest mocks on neo4jClient.runWrite — no live Neo4j required.
 */
jest.mock("../src/graph/neo4jClient", () => ({
  isNeo4jEnabled: jest.fn(() => true),
  runWrite: jest.fn(async () => ({
    records: [{ get: (key) => (key === "merged" || key === "orphanCount" || key === "campaignCount" ? 2 : 0) }],
  })),
}));

jest.mock("../src/lib/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const { runWrite, isNeo4jEnabled } = require("../src/graph/neo4jClient");
const { mergeDuplicateGraphNodes, pruneOrphanGraphNodes } = require("../src/graph/graphMaintenance");

describe("graphMaintenance", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isNeo4jEnabled.mockReturnValue(true);
  });

  it("mergeDuplicateGraphNodes runs Sender, Url, and Domain merge Cypher writes", async () => {
    const result = await mergeDuplicateGraphNodes();
    expect(runWrite).toHaveBeenCalledTimes(3);
    expect(result.mergedSenders).toBe(2);
    expect(result.mergedUrls).toBe(2);
    expect(result.mergedDomains).toBe(2);
  });

  it("pruneOrphanGraphNodes merges duplicates then deletes orphans and empty campaigns", async () => {
    const result = await pruneOrphanGraphNodes();
    // 3 merge queries + 2 prune queries
    expect(runWrite).toHaveBeenCalledTimes(5);
    expect(result.deletedOrphans).toBe(2);
    expect(result.deletedEmptyCampaigns).toBe(2);
    expect(result.mergedSenders).toBe(2);
  });

  it("pruneOrphanGraphNodes skips when Neo4j disabled", async () => {
    isNeo4jEnabled.mockReturnValue(false);
    const result = await pruneOrphanGraphNodes();
    expect(runWrite).not.toHaveBeenCalled();
    expect(result.skipped).toBe(true);
  });
});
