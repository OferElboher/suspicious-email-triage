/**
 * Upsert Review, Sender, Url, and Domain nodes for one Mongo review document.
 * Called after review create and again after Celery completes (verdict available).
 */
const { domainFromUrl } = require("./domainFromUrl");
const { runWrite } = require("./neo4jClient");
const { detectCampaignsForReview } = require("./campaignDetection");
const logger = require("../lib/logger");

/** Normalize Mongo/Mongoose review into plain fields for Cypher parameters. */
function reviewToGraphPayload(review) {
  const id = String(review._id || review.id || "");
  const links = Array.isArray(review.links) ? review.links : [];
  const verdict =
    review.analysisResult?.verdict ||
    review.override?.verdict ||
    null;
  const linkRows = links
    .map((href) => {
      const host = domainFromUrl(href);
      return host ? { href, host } : null;
    })
    .filter(Boolean);

  return {
    reviewId: id,
    senderEmail: String(review.senderEmail || "").toLowerCase(),
    senderName: String(review.senderName || ""),
    subject: String(review.subject || ""),
    status: String(review.status || "pending"),
    verdict,
    links: linkRows,
  };
}

/** MERGE graph nodes/relationships for one review (idempotent upsert pattern). */
async function syncReviewToGraph(review) {
  const payload = reviewToGraphPayload(review);
  if (!payload.reviewId || !payload.senderEmail) {
    return { synced: false, reason: "missing_id_or_sender" };
  }

  const cypher = `
    MERGE (s:Sender {email: $senderEmail})
    SET s.name = $senderName
    MERGE (r:Review {id: $reviewId})
    SET r.subject = $subject,
        r.status = $status,
        r.verdict = $verdict
    MERGE (s)-[:SENT]->(r)
    WITH r
    OPTIONAL MATCH (r)-[oldUrl:CONTAINS_URL]->(:Url)
    DELETE oldUrl
    WITH r
    UNWIND $links AS link
    MERGE (u:Url {href: link.href})
    MERGE (r)-[:CONTAINS_URL]->(u)
    MERGE (d:Domain {host: link.host})
    MERGE (u)-[:RESOLVES_TO]->(d)
  `;
  // DELETE old CONTAINS_URL edges so removed links do not linger when body is edited.
  try {
    await runWrite(cypher, payload);
    const campaigns = await detectCampaignsForReview(payload.reviewId);
    logger.info("graph", "review synced", {
      reviewId: payload.reviewId,
      linkCount: payload.links.length,
      campaignCount: campaigns.length,
    });
    return { synced: true, reviewId: payload.reviewId, campaigns };
  } catch (err) {
    logger.error("graph", "sync failed", {
      reviewId: payload.reviewId,
      error: err.message,
    });
    return { synced: false, reason: err.message };
  }
}

module.exports = { reviewToGraphPayload, syncReviewToGraph };
