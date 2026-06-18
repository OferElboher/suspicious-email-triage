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
 * Merge duplicate Sender/Url/Domain nodes that share business keys but have separate
 * Neo4j element ids (legacy test data). Keeps the first node in each group.
 * @returns {Promise<{ mergedSenders: number, mergedUrls: number, mergedDomains: number }>}
 */
async function mergeDuplicateGraphNodes() {
  const senderResult = await runWrite(
    `
    MATCH (s:Sender)
    WITH s.email AS email, collect(s) AS group
    WHERE size(group) > 1
    WITH group[0] AS keeper, group[1..] AS extras
    UNWIND extras AS dup
    OPTIONAL MATCH (dup)-[:SENT]->(r:Review)
    WITH keeper, dup, collect(r) AS reviews
    FOREACH (r IN reviews | MERGE (keeper)-[:SENT]->(r))
    WITH keeper, dup
    DETACH DELETE dup
    RETURN count(dup) AS merged
    `
  );

  const urlResult = await runWrite(
    `
    MATCH (u:Url)
    WITH u.href AS href, collect(u) AS group
    WHERE size(group) > 1
    WITH group[0] AS keeper, group[1..] AS extras
    UNWIND extras AS dup
    OPTIONAL MATCH (dup)-[:RESOLVES_TO]->(d:Domain)
    WITH keeper, dup, collect(d) AS domains
    FOREACH (d IN domains | MERGE (keeper)-[:RESOLVES_TO]->(d))
    WITH keeper, dup
    OPTIONAL MATCH (r:Review)-[:CONTAINS_URL]->(dup)
    WITH keeper, dup, collect(r) AS reviews
    FOREACH (r IN reviews | MERGE (r)-[:CONTAINS_URL]->(keeper))
    WITH keeper, dup
    DETACH DELETE dup
    RETURN count(dup) AS merged
    `
  );

  const domainResult = await runWrite(
    `
    MATCH (d:Domain)
    WITH d.host AS host, collect(d) AS group
    WHERE size(group) > 1
    WITH group[0] AS keeper, group[1..] AS extras
    UNWIND extras AS dup
    OPTIONAL MATCH (u:Url)-[:RESOLVES_TO]->(dup)
    WITH keeper, dup, collect(u) AS urls
    FOREACH (u IN urls | MERGE (u)-[:RESOLVES_TO]->(keeper))
    WITH keeper, dup
    DETACH DELETE dup
    RETURN count(dup) AS merged
    `
  );

  const mergedSenders = Number(senderResult?.records?.[0]?.get("merged") || 0);
  const mergedUrls = Number(urlResult?.records?.[0]?.get("merged") || 0);
  const mergedDomains = Number(domainResult?.records?.[0]?.get("merged") || 0);

  if (mergedSenders || mergedUrls || mergedDomains) {
    logger.info("neo4j", "merged duplicate graph nodes", {
      mergedSenders,
      mergedUrls,
      mergedDomains,
    });
  }

  return { mergedSenders, mergedUrls, mergedDomains };
}

/**
 * Delete graph nodes with zero relationships (orphan Url/Domain/Review debris).
 * @returns {Promise<{ deletedOrphans: number, deletedEmptyCampaigns: number }>}
 */
async function pruneOrphanGraphNodes() {
  if (!isNeo4jEnabled()) {
    return {
      deletedOrphans: 0,
      deletedEmptyCampaigns: 0,
      mergedSenders: 0,
      mergedUrls: 0,
      mergedDomains: 0,
      skipped: true,
    };
  }

  const mergeStats = await mergeDuplicateGraphNodes();

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

  return { deletedOrphans, deletedEmptyCampaigns, ...mergeStats };
}

module.exports = { mergeDuplicateGraphNodes, pruneOrphanGraphNodes };
