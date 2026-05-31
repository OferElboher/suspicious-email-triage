const { toNeo4jParams } = require("../src/graph/neo4jClient");
const neo4j = require("neo4j-driver");

describe("toNeo4jParams", () => {
  it("converts LIMIT-style integers to neo4j Integer (not JS float)", () => {
    const params = toNeo4jParams({ limit: 50 });
    expect(neo4j.isInt(params.limit)).toBe(true);
    expect(params.limit.toNumber()).toBe(50);
  });

  it("leaves string arrays unchanged for IN clauses", () => {
    const params = toNeo4jParams({ riskyVerdicts: ["suspicious", "likely_phishing"] });
    expect(params.riskyVerdicts).toEqual(["suspicious", "likely_phishing"]);
  });
});
