/**
 * In-process counters/gauges for Prometheus text exposition (dev/staging free path).
 * Pattern: lightweight metrics without external APM — scraped via GET /ops/prometheus.
 */

/** Mutable metric registry (resets on process restart — acceptable for dev). */
const state = {
  httpRequestsTotal: 0,
  httpErrorsTotal: 0,
  reviewsCreatedTotal: 0,
  graphSyncFailuresTotal: 0,
  lastReadinessStatus: 1,
  startedAt: Date.now(),
};

/** Increment total HTTP requests (call from optional middleware). */
function incrementHttpRequests() {
  state.httpRequestsTotal += 1;
}

/** Increment HTTP 5xx counter. */
function incrementHttpErrors() {
  state.httpErrorsTotal += 1;
}

/** Increment review create counter after successful POST /reviews. */
function incrementReviewsCreated() {
  state.reviewsCreatedTotal += 1;
}

/** Increment when graph sync fails. */
function incrementGraphSyncFailures() {
  state.graphSyncFailuresTotal += 1;
}

/** Store 1 when ready, 0 when degraded (updated by alerts evaluator). */
function setReadinessGauge(value) {
  state.lastReadinessStatus = value ? 1 : 0;
}

/** Render Prometheus exposition format (text/plain version 0.0.4). */
function renderPrometheusText() {
  const uptimeSec = Math.floor((Date.now() - state.startedAt) / 1000);
  return [
    "# HELP triage_http_requests_total Total HTTP requests observed by metrics middleware.",
    "# TYPE triage_http_requests_total counter",
    `triage_http_requests_total ${state.httpRequestsTotal}`,
    "# HELP triage_http_errors_total Total HTTP 5xx responses.",
    "# TYPE triage_http_errors_total counter",
    `triage_http_errors_total ${state.httpErrorsTotal}`,
    "# HELP triage_reviews_created_total Reviews created via API.",
    "# TYPE triage_reviews_created_total counter",
    `triage_reviews_created_total ${state.reviewsCreatedTotal}`,
    "# HELP triage_graph_sync_failures_total Graph sync failures.",
    "# TYPE triage_graph_sync_failures_total counter",
    `triage_graph_sync_failures_total ${state.graphSyncFailuresTotal}`,
    "# HELP triage_readiness_status 1 when last readiness check passed.",
    "# TYPE triage_readiness_status gauge",
    `triage_readiness_status ${state.lastReadinessStatus}`,
    "# HELP triage_process_uptime_seconds Process uptime.",
    "# TYPE triage_process_uptime_seconds gauge",
    `triage_process_uptime_seconds ${uptimeSec}`,
    "",
  ].join("\n");
}

module.exports = {
  incrementHttpRequests,
  incrementHttpErrors,
  incrementReviewsCreated,
  incrementGraphSyncFailures,
  setReadinessGauge,
  renderPrometheusText,
  _state: state,
};
