/**
 * Neo4j housekeeping — remove stale graph debris left by older sync code paths.
 *
 * Pattern: DETACH DELETE nodes that no longer participate in any relationship, plus
 * empty Campaign shells that lost their PART_OF_CAMPAIGN edges after review resets.
 *
 * Technology: Cypher write queries via neo4j-driver (`runWrite` in neo4jClient.js).
 */
const { runWrite, isNeo4jEnabled } = require("./neo4jClient");
const logger = require("../lib/logger");

/**
 * Delete graph nodes with zero relationships (orphan Url/Domain/Review debris).
 * @returns {Promise<{ deletedOrphans: number, deletedEmptyCampaigns: number }>}
 */
async function pruneOrphanGraphNodes() {
  if (!isNeo4jEnabled()) {
    return { deletedOrphans: 0, deletedEmptyCampaigns: 0, skipped: true };
  }

  const orphanResult = await runWrite(
    `
    MATCH (n)
    WHERE NOT (n)--()
    WITH collect(n) AS orphans
    WITH orphans, size(orphans) AS orphanCount
    FOREACH (o IN orphans | DETACH DELETE o)
    RETURN orphanCount
    `
  );

  const campaignResult = await runWrite(
    `
    MATCH (c:Campaign)
    WHERE NOT (c)<-[:PART_OF_CAMPAIGN]-()
    WITH collect(c) AS emptyCampaigns
    WITH emptyCampaigns, size(emptyCampaigns) AS campaignCount
    FOREACH (c IN emptyCampaigns | DETACH DELETE c)
    RETURN campaignCount
    `
  );

  const deletedOrphans = Number(orphanResult?.records?.[0]?.get("orphanCount") || 0);
  const deletedEmptyCampaigns = Number(
    campaignResult?.records?.[0]?.get("campaignCount") || 0
  );

  if (deletedOrphans || deletedEmptyCampaigns) {
    logger.info("neo4j", "pruned orphan graph nodes", {
      deletedOrphans,
      deletedEmptyCampaigns,
    });
  }

  return { deletedOrphans, deletedEmptyCampaigns };
}

module.exports = { pruneOrphanGraphNodes };
