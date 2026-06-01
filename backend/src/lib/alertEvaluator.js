/**
 * Dev-friendly alert evaluation from readiness + in-process metrics (TBD 1.4 free path).
 * Production would forward to PagerDuty/Datadog; here we return JSON for GET /ops/alerts.
 */
const { readinessPayload } = require("./healthChecks");
const { _state: metricsState } = require("./appMetrics");
const { setReadinessGauge } = require("./appMetrics");

/** Thresholds configurable via env for staging/prod tuning. */
function alertThresholds() {
  return {
    maxGraphSyncFailures: Number(process.env.ALERT_MAX_GRAPH_SYNC_FAILURES || 10),
    maxHttpErrors: Number(process.env.ALERT_MAX_HTTP_ERRORS || 50),
  };
}

/** Evaluate simple rules and return alert objects for the ops API. */
async function evaluateAlerts() {
  const ready = await readinessPayload();
  setReadinessGauge(ready.status === "ok");

  const thresholds = alertThresholds();
  const alerts = [];

  if (ready.status !== "ok") {
    const failed = ready.checks.filter((c) => !c.ok).map((c) => c.name);
    alerts.push({
      id: "readiness_degraded",
      severity: "critical",
      message: `Readiness degraded: ${failed.join(", ")}`,
      since: new Date().toISOString(),
    });
  }

  if (metricsState.graphSyncFailuresTotal >= thresholds.maxGraphSyncFailures) {
    alerts.push({
      id: "graph_sync_failures_high",
      severity: "warning",
      message: `Graph sync failures ${metricsState.graphSyncFailuresTotal} >= ${thresholds.maxGraphSyncFailures}`,
      since: new Date().toISOString(),
    });
  }

  if (metricsState.httpErrorsTotal >= thresholds.maxHttpErrors) {
    alerts.push({
      id: "http_errors_high",
      severity: "warning",
      message: `HTTP 5xx count ${metricsState.httpErrorsTotal} >= ${thresholds.maxHttpErrors}`,
      since: new Date().toISOString(),
    });
  }

  return {
    evaluatedAt: new Date().toISOString(),
    alertCount: alerts.length,
    alerts,
    readiness: ready.status,
    metrics: {
      httpRequestsTotal: metricsState.httpRequestsTotal,
      httpErrorsTotal: metricsState.httpErrorsTotal,
      reviewsCreatedTotal: metricsState.reviewsCreatedTotal,
      graphSyncFailuresTotal: metricsState.graphSyncFailuresTotal,
    },
  };
}

module.exports = { evaluateAlerts, alertThresholds };
