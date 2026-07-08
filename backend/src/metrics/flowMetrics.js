/**
 * Live flow dashboard snapshot — queue depths, ingest rates, and pipeline counters.
 *
 * Pattern: read-mostly aggregates for SOC-style gauges (Mongo counts + in-process counters).
 * Technology: Mongoose countDocuments, Redis simulationStore, appMetrics state.
 *
 * Gauge scaling trick: “share of total queue” needles often sit at 0% during fast simulation
 * (thousands completed, few pending). Activity gauges scale against simulation target rate so
 * needles move while synthetic traffic is running.
 */
const Review = require("../models/Review");
const { _state: appMetricsState } = require("../lib/appMetrics");
const { readSimulation } = require("../dev/simulationStore");
const { isDevDeployment } = require("../config/runtime");
const { getSearchIndexStats } = require("../search/reviewSearchIndex");
const { computeArrivalVolatility } = require("./arrivalVolatility");
const logger = require("../lib/logger");

/** Pipeline statuses shown on flow gauges (matches Review schema enum). */
const QUEUE_STATUSES = ["pending", "processing", "completed", "failed"];

/**
 * Count reviews in MongoDB for one pipeline status.
 * @param {string} status
 * @returns {Promise<number>}
 */
async function countByStatus(status) {
  return Review.countDocuments({ status });
}

/**
 * Count reviews whose createdAt falls within the last N milliseconds.
 * @param {number} windowMs
 * @returns {Promise<number>}
 */
async function countCreatedSince(windowMs) {
  const since = new Date(Date.now() - windowMs);
  return Review.countDocuments({ createdAt: { $gte: since } });
}

/**
 * Count reviews that reached completed status recently (updatedAt proxy for throughput).
 * @param {number} windowMs
 * @returns {Promise<number>}
 */
async function countCompletedSince(windowMs) {
  const since = new Date(Date.now() - windowMs);
  return Review.countDocuments({ status: "completed", updatedAt: { $gte: since } });
}

/**
 * Map a raw count to 0–100 for a gauge needle using a dynamic ceiling.
 * @param {number} count
 * @param {number} scaleMax
 * @returns {number}
 */
function activityPercent(count, scaleMax) {
  const ceiling = Math.max(Number(scaleMax) || 1, 1);
  return Math.min(100, Math.round((Number(count) / ceiling) * 100));
}

/**
 * Build one live snapshot for GET /metrics/flow-dashboard (polled by React gauges/clocks).
 * @returns {Promise<object>}
 */
async function getFlowDashboardSnapshot() {
  const generatedAt = new Date();
  const uptimeSeconds = Math.floor((Date.now() - appMetricsState.startedAt) / 1000);

  const [
    pending,
    processing,
    completed,
    failed,
    createdLastMinute,
    createdLastFiveMinutes,
    completedLastMinute,
    arrivalVolatility,
  ] = await Promise.all([
    countByStatus("pending"),
    countByStatus("processing"),
    countByStatus("completed"),
    countByStatus("failed"),
    countCreatedSince(60_000),
    countCreatedSince(5 * 60_000),
    countCompletedSince(60_000),
    computeArrivalVolatility(),
  ]);

  const queueTotal = pending + processing + completed + failed;
  const backlog = pending + processing;
  const createdPerMinuteAvg5m = Math.round((createdLastFiveMinutes / 5) * 10) / 10;

  let simulation = { available: false, enabled: false, eventsPerMinute: 0 };
  if (isDevDeployment()) {
    try {
      const sim = await readSimulation();
      simulation = {
        available: true,
        enabled: Boolean(sim.enabled),
        eventsPerMinute: Number(sim.eventsPerMinute) || 0,
      };
    } catch (err) {
      logger.warn("metrics", "simulation read for flow dashboard failed", { error: err.message });
    }
  }

  let searchIndex = { enabled: false, documentCount: 0 };
  try {
    const stats = await getSearchIndexStats();
    searchIndex = {
      enabled: Boolean(stats.enabled),
      reachable: Boolean(stats.reachable),
      documentCount: Number(stats.documentCount) || 0,
    };
  } catch {
    /* optional ES — dashboard still useful without search stats */
  }

  /** Ingest needle scale: configured sim rate, observed 1m/5m traffic, or laptop-friendly floor. */
  const ingestGaugeMax = Math.max(
    simulation.enabled ? simulation.eventsPerMinute : 0,
    createdLastMinute,
    createdPerMinuteAvg5m,
    10
  );

  /** Activity scales — keep needles responsive when completed ≫ pending (fast Celery). */
  const pendingScaleMax = Math.max(10, simulation.eventsPerMinute * 2, pending, 1);
  const processingScaleMax = Math.max(10, simulation.eventsPerMinute, processing, 1);
  const completionScaleMax = Math.max(10, simulation.eventsPerMinute, completedLastMinute, 1);

  return {
    generatedAt: generatedAt.toISOString(),
    clocks: {
      serverUtc: generatedAt.toISOString(),
      uptimeSeconds,
      apiStartedAt: new Date(appMetricsState.startedAt).toISOString(),
    },
    queue: {
      pending,
      processing,
      completed,
      failed,
      total: queueTotal,
      backlog,
    },
    rates: {
      createdLastMinute,
      createdLastFiveMinutes,
      completedLastMinute,
      /** Average ingests per minute over the last five minutes (smoothed gauge input). */
      createdPerMinuteAvg5m,
      /** Inter-arrival gap statistics for the volatility demo gauge. */
      arrivalVolatility,
    },
    pipeline: {
      reviewsCreatedTotal: appMetricsState.reviewsCreatedTotal,
      httpRequestsTotal: appMetricsState.httpRequestsTotal,
      httpErrorsTotal: appMetricsState.httpErrorsTotal,
      graphSyncFailuresTotal: appMetricsState.graphSyncFailuresTotal,
      readinessStatus: appMetricsState.lastReadinessStatus,
    },
    simulation,
    searchIndex,
    gauges: {
      /** Share-based (queue composition) — useful when backlog is large vs history. */
      pendingPercent: queueTotal ? Math.round((pending / queueTotal) * 100) : 0,
      processingPercent: queueTotal ? Math.round((processing / queueTotal) * 100) : 0,
      backlogPressurePercent:
        backlog + completed > 0 ? Math.round((backlog / (backlog + completed)) * 100) : 0,
      /** Activity-based (throughput) — needles track live simulation / ingest. */
      ingestRatePercent: activityPercent(createdLastMinute, ingestGaugeMax),
      ingestGaugeMax,
      pendingActivityPercent: activityPercent(pending, pendingScaleMax),
      pendingScaleMax,
      processingActivityPercent: activityPercent(processing, processingScaleMax),
      processingScaleMax,
      completionThroughputPercent: activityPercent(completedLastMinute, completionScaleMax),
      completionScaleMax,
      /** Burstiness needle — std dev of gaps between recent review createdAt timestamps. */
      arrivalVolatilityPercent: arrivalVolatility.volatilityPercent,
    },
  };
}

module.exports = {
  QUEUE_STATUSES,
  getFlowDashboardSnapshot,
  /** Exported for unit tests without hitting Mongo. */
  countByStatus,
  countCreatedSince,
  activityPercent,
};
