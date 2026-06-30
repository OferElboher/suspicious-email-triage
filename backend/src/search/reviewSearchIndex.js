/**
 * Review document indexing in Elasticsearch (full-text search, laptop-sized dev index).
 */
const { getElasticsearchClient, resetElasticsearchClient, isElasticsearchEnabled } = require("./elasticClient");
const { dayBoundsUtc, pageIndexForDate } = require("../lib/dateNav");
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

/** Default page size for search API (matches review queue pagination in the React UI). */
const DEFAULT_SEARCH_PAGE_SIZE = 20;

/** Clamp limit/offset for Elasticsearch `size` and `from` (max 100 rows per request). */
function parseSearchPaging(limit, offset) {
  const size = Math.min(Math.max(parseInt(limit, 10) || DEFAULT_SEARCH_PAGE_SIZE, 1), 100);
  const from = Math.max(parseInt(offset, 10) || 0, 0);
  return { size, from };
}

/**
 * Build Elasticsearch bool query from analyst filters (shared by search + page-for-date).
 * Pattern: must = full-text multi_match; filter = exact term/range/regexp clauses.
 */
function buildReviewSearchQuery({
  query = "",
  verdict = "",
  status = "",
  senderEmail = "",
  updatedFrom = null,
  updatedTo = null,
  subjectRegex = "",
  bodyRegex = "",
  linksRegex = "",
} = {}) {
  const q = String(query || "").trim();
  const must = [];
  const filter = [];

  if (q) {
    must.push({
      multi_match: {
        query: q,
        fields: ["subject^2", "body", "senderEmail", "senderName", "links"],
        type: "best_fields",
      },
    });
  }

  if (verdict) {
    filter.push({ term: { verdict: String(verdict).toLowerCase() } });
  }
  if (status) {
    filter.push({ term: { status: String(status).toLowerCase() } });
  }
  if (senderEmail) {
    filter.push({ term: { senderEmail: String(senderEmail).toLowerCase() } });
  }

  const range = {};
  if (updatedFrom) {
    range.gte = updatedFrom;
  }
  if (updatedTo) {
    range.lte = updatedTo;
  }
  if (Object.keys(range).length) {
    filter.push({ range: { updatedAt: range } });
  }

  const addRegexFilter = (field, pattern) => {
    const trimmed = String(pattern || "").trim();
    if (!trimmed) {
      return;
    }
    filter.push({ regexp: { [field]: trimmed } });
  };
  addRegexFilter("subject", subjectRegex);
  addRegexFilter("body", bodyRegex);
  addRegexFilter("links", linksRegex);

  if (must.length || filter.length) {
    return {
      bool: {
        ...(must.length ? { must } : {}),
        ...(filter.length ? { filter } : {}),
      },
    };
  }
  return { match_all: {} };
}

/** Merge extra filter clauses into an existing ES query (used for date-jump counts). */
function mergeQueryWithFilters(esQuery, extraFilters) {
  if (!extraFilters.length) {
    return esQuery;
  }
  if (esQuery.match_all) {
    return { bool: { filter: extraFilters } };
  }
  if (esQuery.bool) {
    return {
      bool: {
        ...esQuery.bool,
        filter: [...(esQuery.bool.filter || []), ...extraFilters],
      },
    };
  }
  return { bool: { must: [esQuery], filter: extraFilters } };
}

/** Full-text and field-filter search across indexed review documents (offset pagination). */
async function searchReviews({
  query = "",
  limit = DEFAULT_SEARCH_PAGE_SIZE,
  offset = 0,
  verdict = "",
  status = "",
  senderEmail = "",
  updatedFrom = null,
  updatedTo = null,
  subjectRegex = "",
  bodyRegex = "",
  linksRegex = "",
} = {}) {
  const es = await getElasticsearchClient();
  if (!es) {
    return { enabled: false, hits: [], total: 0, limit: 0, offset: 0, hasMore: false };
  }
  await ensureReviewIndex();
  const { size, from } = parseSearchPaging(limit, offset);
  const q = String(query || "").trim();
  const esQuery = buildReviewSearchQuery({
    query: q,
    verdict,
    status,
    senderEmail,
    updatedFrom,
    updatedTo,
    subjectRegex,
    bodyRegex,
    linksRegex,
  });

  const result = await es.search({
    index: INDEX_NAME,
    from,
    size,
    sort: [{ updatedAt: "desc" }],
    query: esQuery,
  });

  const total = result.hits.total?.value ?? result.hits.hits.length;
  const hits = result.hits.hits.map((h) => ({ id: h._id, ...h._source }));

  return {
    enabled: true,
    query: q || null,
    hits,
    total,
    limit: size,
    offset: from,
    hasMore: from + hits.length < total,
  };
}

/**
 * Page index for jumping to a calendar day within current search filters.
 * Sort is updatedAt DESC — same algorithm as GET /reviews/page-for-date (dateNav.js).
 */
async function pageForDateSearch({
  date = "",
  limit = DEFAULT_SEARCH_PAGE_SIZE,
  query = "",
  verdict = "",
  status = "",
  senderEmail = "",
  updatedFrom = null,
  updatedTo = null,
  subjectRegex = "",
  bodyRegex = "",
  linksRegex = "",
} = {}) {
  const es = await getElasticsearchClient();
  if (!es) {
    return { enabled: false };
  }
  const bounds = dayBoundsUtc(date);
  if (!bounds) {
    return { enabled: true, error: "invalid_date" };
  }
  await ensureReviewIndex();
  const { size } = parseSearchPaging(limit, 0);
  const baseQuery = buildReviewSearchQuery({
    query,
    verdict,
    status,
    senderEmail,
    updatedFrom,
    updatedTo,
    subjectRegex,
    bodyRegex,
    linksRegex,
  });

  const onDayQuery = mergeQueryWithFilters(baseQuery, [
    { range: { updatedAt: { gte: bounds.start, lte: bounds.end } } },
  ]);
  const onDayCount = (await es.count({ index: INDEX_NAME, query: onDayQuery })).count;
  if (onDayCount === 0) {
    return { enabled: true, error: "no_reviews_on_date", date: bounds.date };
  }

  const newerQuery = mergeQueryWithFilters(baseQuery, [
    { range: { updatedAt: { gt: bounds.end } } },
  ]);
  const newerCount = (await es.count({ index: INDEX_NAME, query: newerQuery })).count;
  const page = pageIndexForDate(newerCount, size);

  return {
    enabled: true,
    date: bounds.date,
    page,
    limit: size,
    onDayCount,
    totalNewer: newerCount,
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
  DEFAULT_SEARCH_PAGE_SIZE,
  reviewToSearchDocument,
  buildReviewSearchQuery,
  ensureReviewIndex,
  indexReviewDocument,
  searchReviews,
  pageForDateSearch,
  clearReviewIndex,
  getSearchIndexStats,
};
