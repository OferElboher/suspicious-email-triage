/**
 * Detect phishing campaigns by shared domains across suspicious reviews.
 * A Campaign node groups reviews that hit the same domain with risky verdicts.
 */
const { runRead, runWrite } = require("./neo4jClient");

/** Verdicts treated as suspicious for campaign clustering. */
const RISKY_VERDICTS = ["suspicious", "likely_phishing"];

/** Find domains shared by 2+ risky reviews and link them to Campaign nodes. */
async function detectCampaignsForReview(reviewId) {
  const detectCypher = `
    MATCH (d:Domain)<-[:RESOLVES_TO]-(:Url)<-[:CONTAINS_URL]-(r:Review)
    WHERE r.verdict IN $riskyVerdicts
    WITH d, collect(DISTINCT r) AS reviews
    WHERE size(reviews) >= 2
    MERGE (c:Campaign {indicator: d.host})
    SET c.kind = 'shared_domain',
        c.reviewCount = size(reviews),
        c.updatedAt = datetime()
    WITH c, reviews
    UNWIND reviews AS rev
    MERGE (rev)-[:PART_OF_CAMPAIGN]->(c)
    RETURN c.indicator AS indicator, c.reviewCount AS reviewCount
  `;

  await runWrite(detectCypher, { riskyVerdicts: RISKY_VERDICTS });

  const rows = await runRead(
    `
    MATCH (r:Review {id: $reviewId})-[:PART_OF_CAMPAIGN]->(c:Campaign)
    RETURN c.indicator AS indicator, c.reviewCount AS reviewCount, c.kind AS kind
    ORDER BY c.reviewCount DESC
    `,
    { reviewId }
  );

  return rows.map((record) => ({
    indicator: record.get("indicator"),
    reviewCount: Number(record.get("reviewCount") || 0),
    kind: record.get("kind") || "shared_domain",
  }));
}

/** List all campaigns with shared-indicator metadata for the dashboard API. */
async function listCampaigns(limit = 50) {
  const rows = await runRead(
    `
    MATCH (c:Campaign)
    OPTIONAL MATCH (c)<-[:PART_OF_CAMPAIGN]-(r:Review)
    WITH c, collect(DISTINCT r.id) AS reviewIds
    RETURN c.indicator AS indicator,
           c.kind AS kind,
           c.reviewCount AS reviewCount,
           reviewIds
    ORDER BY c.reviewCount DESC
    LIMIT $limit
    `,
    { limit: Number(limit) }
  );

  return rows.map((record) => ({
    indicator: record.get("indicator"),
    kind: record.get("kind") || "shared_domain",
    reviewCount: Number(record.get("reviewCount") || 0),
    reviewIds: record.get("reviewIds") || [],
  }));
}

module.exports = { RISKY_VERDICTS, detectCampaignsForReview, listCampaigns };
