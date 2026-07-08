/**
 * Live flow dashboard — gauges and clocks for inbound review pipeline (SOC-style).
 *
 * Pattern: poll GET /metrics/flow-dashboard on a user-configurable interval (0.5 s+); needles and
 * clock hands animate via SVG. Includes demo widgets: vertical tank, traffic-light ranges, volatility.
 * Technology: FlowGauge, FlowVerticalGauge, FlowRangeGauge, FlowVolatilityGauge, useFlowDashboardPoll.
 */
import { useCallback, useEffect, useState } from "react";
import FlowGauge from "../components/FlowGauge";
import FlowVerticalGauge from "../components/FlowVerticalGauge";
import FlowRangeGauge from "../components/FlowRangeGauge";
import FlowVolatilityGauge from "../components/FlowVolatilityGauge";
import FlowAnalogClock from "../components/FlowAnalogClock";
import FlowUptimeClock from "../components/FlowUptimeClock";
import HoverHelp from "../components/HoverHelp";
import { useFlowDashboardPoll } from "../hooks/useFlowDashboardPoll";
import {
  FLOW_DASHBOARD_INTERVAL_PRESETS_SEC,
  FLOW_DASHBOARD_MIN_INTERVAL_MS,
  readFlowDashboardRefreshPrefs,
  writeFlowDashboardRefreshPrefs,
} from "../lib/flowDashboardRefresh";

/** Format integer counts for gauge detail captions. */
function fmt(n) {
  return Number(n || 0).toLocaleString();
}

/** Traffic-light bands for backlog pressure range gauge (percent 0–100). */
const BACKLOG_RANGE_ZONES = [
  { from: 0, to: 40, tone: "ok", label: "Normal" },
  { from: 40, to: 70, tone: "warn", label: "Elevated backlog" },
  { from: 70, to: 100, tone: "danger", label: "Critical pressure" },
];

/** Live flow sub-window (#flow) — metrics.read permission. */
export default function FlowDashboardView() {
  const [refreshPrefs, setRefreshPrefs] = useState(() => readFlowDashboardRefreshPrefs());

  const { snapshot, loading, error, refresh } = useFlowDashboardPoll({
    enabled: true,
    autoRefresh: refreshPrefs.autoRefresh,
    intervalMs: refreshPrefs.intervalMs,
  });

  /** Persist refresh choices in localStorage (browser-only UX setting). */
  useEffect(() => {
    writeFlowDashboardRefreshPrefs(refreshPrefs);
  }, [refreshPrefs]);

  const setAutoRefresh = useCallback((autoRefresh) => {
    setRefreshPrefs((prev) => ({ ...prev, autoRefresh }));
  }, []);

  const setIntervalSec = useCallback((sec) => {
    const ms = Math.max(FLOW_DASHBOARD_MIN_INTERVAL_MS, Math.round(Number(sec) * 1000));
    setRefreshPrefs((prev) => ({ ...prev, intervalMs: ms }));
  }, []);

  const q = snapshot?.queue || {};
  const rates = snapshot?.rates || {};
  const gauges = snapshot?.gauges || {};
  const sim = snapshot?.simulation || {};
  const pipe = snapshot?.pipeline || {};
  const volatility = rates.arrivalVolatility || {};
  const awaitingFirstSnapshot = !snapshot && loading;
  const intervalSec = refreshPrefs.intervalMs / 1000;

  return (
    <main className="layout layout--single flow-dashboard">
      <section className="card flow-dashboard__header">
        <HoverHelp text="Real-time view of review queue depth, ingest rate, and pipeline health. Configure auto-refresh below (0.5 s minimum). Start dev simulation on the Review dashboard to watch needles move.">
          <h2>Live flow dashboard</h2>
        </HoverHelp>
        <p className="muted">
          Gauges show MongoDB queue depths and ingest rates; clocks show API server time and uptime.
          During <strong>dev simulation</strong>, synthetic emails flow pending → processing → completed.
          The showcase row demonstrates <strong>vertical</strong>, <strong>range (red/amber/green)</strong>,
          and <strong>high-frequency volatility</strong> gauge patterns used on SOC wall displays.
        </p>
        <div className="toolbar flow-dashboard__toolbar">
          <HoverHelp text="Immediately fetch a new snapshot from GET /metrics/flow-dashboard.">
            <button type="button" disabled={loading} onClick={() => refresh().catch(() => {})}>
              {loading ? "Refreshing…" : "Refresh now"}
            </button>
          </HoverHelp>
          <HoverHelp text="When enabled, the browser polls the API on the interval below. Disable to reduce load during debugging.">
            <label className="flow-dashboard__refresh-toggle">
              <input
                type="checkbox"
                checked={refreshPrefs.autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              Auto-refresh
            </label>
          </HoverHelp>
          <HoverHelp text="Poll period in seconds. Minimum 0.5 s (500 ms). Stored in localStorage only.">
            <label className="flow-dashboard__refresh-interval">
              Every
              <select
                value={String(intervalSec)}
                disabled={!refreshPrefs.autoRefresh}
                onChange={(e) => setIntervalSec(Number(e.target.value))}
              >
                {FLOW_DASHBOARD_INTERVAL_PRESETS_SEC.map((sec) => (
                  <option key={sec} value={String(sec)}>
                    {sec} s
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0.5}
                step={0.5}
                disabled={!refreshPrefs.autoRefresh}
                value={intervalSec}
                onChange={(e) => setIntervalSec(e.target.value)}
                aria-label="Custom refresh interval in seconds"
              />
              s
            </label>
          </HoverHelp>
          {snapshot?.generatedAt && (
            <span className="muted">
              Last update: {String(snapshot.generatedAt).slice(11, 19)} UTC
            </span>
          )}
        </div>
        {error && <p className="status-failed">{error}</p>}
        {awaitingFirstSnapshot && (
          <p className="muted" role="status">
            Loading first metrics snapshot…
          </p>
        )}
      </section>

      <div className="flow-dashboard__clocks">
        <FlowAnalogClock serverUtc={snapshot?.clocks?.serverUtc} label="Server time (UTC)" />
        <FlowUptimeClock uptimeSeconds={snapshot?.clocks?.uptimeSeconds} label="API uptime" />
        {sim.available && (
          <div className="flow-dashboard__sim-pill">
            <HoverHelp text="Dev simulation state from Redis (triage:dev:simulation). Start/stop on Review dashboard.">
              <div>
                <strong>Simulation</strong>
                <div className={sim.enabled ? "status-ok" : "muted"}>
                  {sim.enabled
                    ? `Running · ${sim.eventsPerMinute}/min`
                    : "Stopped"}
                </div>
              </div>
            </HoverHelp>
          </div>
        )}
      </div>

      <section className="card flow-dashboard__showcase">
        <HoverHelp text="Educational widgets demonstrating alternate SOC gauge styles: vertical tank fill, traffic-light threshold bands with warning icon, and a volatility dial that jitters ten times per second between API polls.">
          <h3>Gauge patterns (SOC demos)</h3>
        </HoverHelp>
        <div className="flow-dashboard__gauges flow-dashboard__gauges--showcase">
          <FlowVerticalGauge
            value={gauges.pendingActivityPercent}
            primaryDisplay={snapshot ? fmt(q.pending) : "—"}
            label="Vertical — pending level"
            detail={`Tank fill mirrors pending activity (${gauges.pendingActivityPercent ?? 0}% of scale)`}
            tone={q.pending > (gauges.pendingScaleMax || 10) * 0.6 ? "warn" : "ok"}
          />
          <FlowRangeGauge
            value={gauges.backlogPressurePercent}
            zones={BACKLOG_RANGE_ZONES}
            primaryDisplay={snapshot ? `${gauges.backlogPressurePercent ?? 0}%` : "—"}
            label="Range — backlog pressure"
            detail={`${fmt(q.backlog)} in-flight vs ${fmt(q.completed)} done · ⚠ in amber/red zones`}
          />
          <FlowVolatilityGauge
            basePercent={gauges.arrivalVolatilityPercent ?? 0}
            label="Arrival volatility (σ jitter)"
            primaryDisplay={
              snapshot && volatility.stdDevMs != null ? `${fmt(volatility.stdDevMs)} ms σ` : "—"
            }
            detail={`Gap std dev over ${volatility.gapCount ?? 0} intervals · local 100 ms needle`}
          />
        </div>
      </section>

      <div className="flow-dashboard__gauges" aria-busy={awaitingFirstSnapshot}>
        <FlowGauge
          value={gauges.ingestRatePercent}
          primaryDisplay={snapshot ? `${fmt(rates.createdLastMinute)}/min` : "—"}
          label="Ingest rate (last 1 min)"
          detail={`Scale max ${gauges.ingestGaugeMax || 10}/min · 5m avg ${rates.createdPerMinuteAvg5m ?? 0}/min`}
          tone={rates.createdLastMinute > 0 ? "ok" : "default"}
        />
        <FlowGauge
          value={gauges.pendingActivityPercent}
          primaryDisplay={snapshot ? fmt(q.pending) : "—"}
          label="Pending (in queue)"
          detail={`${fmt(q.pending)} pending · share ${gauges.pendingPercent ?? 0}% of ${fmt(q.total)} total`}
          tone={q.pending > (gauges.pendingScaleMax || 10) * 0.6 ? "warn" : "default"}
        />
        <FlowGauge
          value={gauges.processingActivityPercent}
          primaryDisplay={snapshot ? fmt(q.processing) : "—"}
          label="Processing (Celery)"
          detail={`${fmt(q.processing)} active · share ${gauges.processingPercent ?? 0}% of queue`}
          tone={q.processing > 0 ? "ok" : "default"}
        />
        <FlowGauge
          value={gauges.backlogPressurePercent}
          primaryDisplay={snapshot ? fmt(q.backlog) : "—"}
          label="Backlog pressure"
          detail={`${fmt(q.backlog)} in-flight vs ${fmt(q.completed)} completed`}
          tone={gauges.backlogPressurePercent > 60 ? "warn" : "ok"}
        />
        <FlowGauge
          value={gauges.completionThroughputPercent}
          primaryDisplay={snapshot ? `${fmt(rates.completedLastMinute)}/min` : "—"}
          label="Completion throughput"
          detail={`Finished in last minute · scale max ${gauges.completionScaleMax || 10}/min`}
          tone={rates.completedLastMinute > 0 ? "ok" : "default"}
        />
        <FlowGauge
          value={pipe.readinessStatus === 1 ? 100 : 15}
          primaryDisplay={pipe.readinessStatus === 1 ? "Healthy" : "Degraded"}
          label="Readiness"
          detail={
            pipe.readinessStatus === 1
              ? "Dependencies OK — see GET /health/ready"
              : "Check Mongo, Redis, Kafka, workers"
          }
          tone={pipe.readinessStatus === 1 ? "ok" : "danger"}
        />
      </div>

      <section className="card flow-dashboard__stats">
        <h3>Pipeline counters</h3>
        <ul className="flow-dashboard__stat-grid">
          <li>
            <span className="muted">Created (API + sim total)</span>
            <strong>{fmt(pipe.reviewsCreatedTotal)}</strong>
          </li>
          <li>
            <span className="muted">HTTP requests</span>
            <strong>{fmt(pipe.httpRequestsTotal)}</strong>
          </li>
          <li>
            <span className="muted">HTTP 5xx</span>
            <strong>{fmt(pipe.httpErrorsTotal)}</strong>
          </li>
          <li>
            <span className="muted">Graph sync failures</span>
            <strong>{fmt(pipe.graphSyncFailuresTotal)}</strong>
          </li>
          <li>
            <span className="muted">Search index docs</span>
            <strong>{fmt(snapshot?.searchIndex?.documentCount)}</strong>
          </li>
          <li>
            <span className="muted">Arrival σ (ms)</span>
            <strong>{volatility.stdDevMs ?? 0}</strong>
          </li>
        </ul>
      </section>
    </main>
  );
}
