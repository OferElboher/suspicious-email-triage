/**
 * Transform MongoDB Review documents into Snowflake analytical row shapes.
 *
 * Pattern: ETL mapping layer — operational Mongo schema → denormalized OLAP columns.
 */
const { effectiveVerdict } = require("../lib/effectiveVerdict");
const { ANALYTICS_TABLES } = require("./snowflakeSchemas");

/** Count findings grouped by severity for dashboard rollups. */
function countFindingsBySeverity(findings) {
  const counts = { low: 0, medium: 0, high: 0 };
  (findings || []).forEach((finding) => {
    const key = String(finding.severity || "").toLowerCase();
    if (counts[key] != null) {
      counts[key] += 1;
    }
  });
  return counts;
}

/** Milliseconds between review createdAt and updatedAt (processing duration proxy). */
function processingDurationMs(review) {
  const created = review.createdAt ? new Date(review.createdAt).getTime() : null;
  const updated = review.updatedAt ? new Date(review.updatedAt).getTime() : null;
  if (created == null || updated == null || updated < created) {
    return 0;
  }
  return updated - created;
}

/**
 * Build REVIEWS_ANALYTICS row from a Mongo review document.
 * @param {object} review — Mongoose document or plain object
 */
function reviewToAnalyticsRow(review) {
  const id = String(review._id || review.id || "");
  const automated = review.analysisResult?.verdict || null;
  const effective = effectiveVerdict(review);
  const findings = review.analysisResult?.findings || [];
  const severityCounts = countFindingsBySeverity(findings);
  const hasOverride = Boolean(review.override?.verdict);

  return {
    review_id: id,
    sender_email: String(review.senderEmail || "").toLowerCase(),
    subject: String(review.subject || ""),
    status: String(review.status || "pending"),
    automated_verdict: automated,
    effective_verdict: effective,
    recommended_action:
      review.override?.recommendedAction ||
      review.analysisResult?.recommendedAction ||
      null,
    findings_count: findings.length,
    findings_high: severityCounts.high,
    findings_medium: severityCounts.medium,
    findings_low: severityCounts.low,
    findings_json: JSON.stringify(findings.slice(0, 20)),
    summary: String(review.analysisResult?.summary || ""),
    has_override: hasOverride,
    override_verdict: review.override?.verdict || null,
    override_analyst: review.override?.analystEmail || null,
    links_count: Array.isArray(review.links) ? review.links.length : 0,
    source: review.source || "user",
    created_at: review.createdAt || null,
    updated_at: review.updatedAt || null,
    exported_at: new Date().toISOString(),
  };
}

/** Build PROCESSING_METRICS row for pipeline timing dashboards. */
function reviewToProcessingMetricRow(review) {
  return {
    review_id: String(review._id || review.id || ""),
    status: String(review.status || "pending"),
    processing_ms: processingDurationMs(review),
    recorded_at: new Date().toISOString(),
  };
}

/** Build OVERRIDE_EVENTS row when analyst changed automated verdict. */
function reviewToOverrideEventRow(review) {
  if (!review.override?.verdict) {
    return null;
  }
  return {
    review_id: String(review._id || review.id || ""),
    analyst_email: review.override.analystEmail || null,
    override_verdict: review.override.verdict,
    automated_verdict: review.analysisResult?.verdict || null,
    reason: review.override.reason || "",
    override_at: review.override.timestamp || review.updatedAt || new Date(),
    exported_at: new Date().toISOString(),
  };
}

/** Package all analytical rows for one review export transaction. */
function buildExportPayload(review) {
  const rowsByTable = {
    [ANALYTICS_TABLES.REVIEWS_ANALYTICS]: [reviewToAnalyticsRow(review)],
    [ANALYTICS_TABLES.PROCESSING_METRICS]: [reviewToProcessingMetricRow(review)],
    [ANALYTICS_TABLES.OVERRIDE_EVENTS]: [],
  };
  const overrideRow = reviewToOverrideEventRow(review);
  if (overrideRow) {
    rowsByTable[ANALYTICS_TABLES.OVERRIDE_EVENTS].push(overrideRow);
  }
  return rowsByTable;
}

module.exports = {
  reviewToAnalyticsRow,
  reviewToProcessingMetricRow,
  reviewToOverrideEventRow,
  buildExportPayload,
  countFindingsBySeverity,
  processingDurationMs,
};
