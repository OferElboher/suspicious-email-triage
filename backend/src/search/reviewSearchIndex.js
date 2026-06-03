/**
 * Review document indexing in Elasticsearch (full-text search, laptop-sized dev index).
 */
const { getElasticsearchClient, resetElasticsearchClient, isElasticsearchEnabled } = require("./elasticClient");
const logger = require("../lib/logger");

/** Index name — single index keeps dev footprint small (no per-tenant sprawl). */
const INDEX_NAME = process.env.ELASTICSEARCH_REVIEWS_INDEX || "triage-reviews";

/** Mapping: lightweight fields for keyword + text search (no dense vectors). */
const INDEX_MAPPINGS = {
  properties: {
    reviewId: { type: "keyword" },
    senderEmail: { type: "keyword" },
    senderName: { type: "text", fields: { keyword: { type: "keyword" } } },
    subject: { type: "text" },
    body: { type: "text" },
    status: { type: "keyword" },
    verdict: { type: "keyword" },
    links: { type: "keyword" },
    updatedAt: { type: "date" },
  },
};

/** Ensure index exists with expected mappings (idempotent). */
async function ensureReviewIndex() {
  const es = await getElasticsearchClient();
  if (!es) {
    return false;
  }
  const exists = await es.indices.exists({ index: INDEX_NAME });
  if (!exists) {
    await es.indices.create({
      index: INDEX_NAME,
      mappings: INDEX_MAPPINGS,
    });
    logger.info("elasticsearch", "index created", { index: INDEX_NAME });
  }
  return true;
}

/** Map Mongo review document to Elasticsearch source row. */
function reviewToSearchDocument(review) {
  const id = String(review._id || review.id || "");
  return {
    reviewId: id,
    senderEmail: String(review.senderEmail || "").toLowerCase(),
    senderName: String(review.senderName || ""),
    subject: String(review.subject || ""),
    body: String(review.body || ""),
    status: String(review.status || "pending"),
    verdict:
      review.override?.verdict ||
      review.analysisResult?.verdict ||
      null,
    links: Array.isArray(review.links) ? review.links : [],
    updatedAt: review.updatedAt || review.createdAt || new Date(),
  };
}

/** Upsert one review into the search index (non-fatal on failure). */
async function indexReviewDocument(review) {
  if (!isElasticsearchEnabled()) {
    return { indexed: false, reason: "disabled" };
  }
  const es = await getElasticsearchClient();
  if (!es) {
    return { indexed: false, reason: "unavailable" };
  }
  try {
    await ensureReviewIndex();
    const doc = reviewToSearchDocument(review);
    if (!doc.reviewId) {
      return { indexed: false, reason: "missing_id" };
    }
    await es.index({
      index: INDEX_NAME,
      id: doc.reviewId,
      document: doc,
      refresh: false,
    });
    return { indexed: true, reviewId: doc.reviewId };
  } catch (err) {
    logger.warn("elasticsearch", "index review failed", {
      reviewId: String(review._id),
      error: err.message,
    });
    return { indexed: false, reason: err.message };
  }
}

/** Full-text search across subject, body, sender (simple query_string for novices). */
async function searchReviews({ query = "", limit = 20 } = {}) {
  const es = await getElasticsearchClient();
  if (!es) {
    return { enabled: false, hits: [], total: 0 };
  }
  await ensureReviewIndex();
  const size = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const q = String(query || "").trim();
  if (!q) {
    const list = await es.search({
      index: INDEX_NAME,
      size,
      sort: [{ updatedAt: "desc" }],
    });
    return {
      enabled: true,
      hits: list.hits.hits.map((h) => ({ id: h._id, ...h._source })),
      total: list.hits.total?.value ?? list.hits.hits.length,
    };
  }
  const result = await es.search({
    index: INDEX_NAME,
    size,
    query: {
      multi_match: {
        query: q,
        fields: ["subject^2", "body", "senderEmail", "senderName", "links"],
        type: "best_fields",
      },
    },
  });
  return {
    enabled: true,
    query: q,
    hits: result.hits.hits.map((h) => ({ id: h._id, ...h._source })),
    total: result.hits.total?.value ?? result.hits.hits.length,
  };
}

/** Delete all documents by dropping and recreating the index (dev reset / admin clear). */
async function clearReviewIndex() {
  const es = await getElasticsearchClient();
  if (!es) {
    return { cleared: false, reason: "unavailable" };
  }
  try {
    const exists = await es.indices.exists({ index: INDEX_NAME });
    if (exists) {
      await es.indices.delete({ index: INDEX_NAME });
    }
    resetElasticsearchClient();
    await ensureReviewIndex();
    logger.warn("elasticsearch", "review index cleared", { index: INDEX_NAME });
    return { cleared: true, index: INDEX_NAME };
  } catch (err) {
    logger.error("elasticsearch", "clear index failed", { error: err.message });
    return { cleared: false, reason: err.message };
  }
}

/** Cluster + index stats for status API. */
async function getSearchIndexStats() {
  if (!isElasticsearchEnabled()) {
    return { enabled: false, index: INDEX_NAME };
  }
  const es = await getElasticsearchClient();
  if (!es) {
    return { enabled: true, reachable: false, index: INDEX_NAME };
  }
  const exists = await es.indices.exists({ index: INDEX_NAME });
  if (!exists) {
    return { enabled: true, reachable: true, index: INDEX_NAME, documentCount: 0 };
  }
  const count = await es.count({ index: INDEX_NAME });
  return {
    enabled: true,
    reachable: true,
    index: INDEX_NAME,
    documentCount: count.count,
  };
}

module.exports = {
  INDEX_NAME,
  reviewToSearchDocument,
  ensureReviewIndex,
  indexReviewDocument,
  searchReviews,
  clearReviewIndex,
  getSearchIndexStats,
};
