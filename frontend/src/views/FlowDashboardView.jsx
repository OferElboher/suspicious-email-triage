/**
 * Live flow dashboard — single-viewport SOC wall (no scroll) for inbound review pipeline.
 *
 * Pattern: `flow-dashboard__body` uses a two-column grid — 3×3 gauges on the left, a dedicated
 * `flow-dashboard__meta` column on the right for clocks/sim/stats so nothing overlaps the dials.
 * Technology: FlowGauge family, clocks, useFlowDashboardPoll, localStorage refresh prefs.
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

/** Format integer counts for compact stat stack and gauge captions. */
function fmt(n) {
  return Number(n || 0).toLocaleString();
}

/** Traffic-light bands for backlog pressure range gauge (percent 0–100). */
const BACKLOG_RANGE_ZONES = [
  { from: 0, to: 40, tone: "ok", label: "Normal" },
  { from: 40, to: 70, tone: "warn", label: "Elevated backlog" },
  { from: 70, to: 100, tone: "danger", label: "Critical pressure" },
];

/** Live flow sub-window (#flow) — metrics.read permission; designed for zero vertical scroll. */
export default function FlowDashboardView() {
  const [refreshPrefs, setRefreshPrefs] = useState(() => readFlowDashboardRefreshPrefs());

  const { snapshot, loading, error, refresh } = useFlowDashboardPoll({
    enabled: true,
    autoRefresh: refreshPrefs.autoRefresh,
    intervalMs: refreshPrefs.intervalMs,
  });

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
    <main className="layout layout--single flow-dashboard flow-dashboard--viewport" data-testid="flow-dashboard-viewport">
      <header className="flow-dashboard__top">
        <HoverHelp text="Single-screen SOC view: queue depths, ingest rates, vertical/range/volatility gauge demos. Clocks and simulation rate sit in the right column. Auto-refresh from 0.5 s.">
          <h2 className="flow-dashboard__title">Live flow dashboard</h2>
        </HoverHelp>
        <div className="toolbar flow-dashboard__toolbar">
          <button type="button" disabled={loading} onClick={() => refresh().catch(() => {})}>
            {loading ? "…" : "Refresh"}
          </button>
          <label className="flow-dashboard__refresh-toggle">
            <input
              type="checkbox"
              checked={refreshPrefs.autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto
          </label>
          <label className="flow-dashboard__refresh-interval">
            <select
              value={String(intervalSec)}
              disabled={!refreshPrefs.autoRefresh}
              onChange={(e) => setIntervalSec(Number(e.target.value))}
              aria-label="Refresh interval preset"
            >
              {FLOW_DASHBOARD_INTERVAL_PRESETS_SEC.map((sec) => (
                <option key={sec} value={String(sec)}>
                  {sec}s
                </option>
              ))}
            </select>
          </label>
          {snapshot?.generatedAt && (
            <span className="flow-dashboard__stamp muted">
              {String(snapshot.generatedAt).slice(11, 19)} UTC
            </span>
          )}
        </div>
        {error && <p className="status-failed flow-dashboard__error">{error}</p>}
        {awaitingFirstSnapshot && (
          <p className="muted flow-dashboard__loading" role="status">
            Loading…
          </p>
        )}
      </header>

      <div className="flow-dashboard__body">
        <div className="flow-dashboard__grid" aria-busy={awaitingFirstSnapshot} data-testid="flow-dashboard-grid">
          <FlowGauge
            value={gauges.ingestRatePercent}
            primaryDisplay={snapshot ? `${fmt(rates.createdLastMinute)}/m` : "—"}
            label="Ingest / min"
            tone={rates.createdLastMinute > 0 ? "ok" : "default"}
          />
          <FlowGauge
            value={gauges.pendingActivityPercent}
            primaryDisplay={snapshot ? fmt(q.pending) : "—"}
            label="Pending"
            tone={q.pending > (gauges.pendingScaleMax || 10) * 0.6 ? "warn" : "default"}
          />
          <FlowGauge
            value={gauges.processingActivityPercent}
            primaryDisplay={snapshot ? fmt(q.processing) : "—"}
            label="Processing"
            tone={q.processing > 0 ? "ok" : "default"}
          />
          <FlowGauge
            value={gauges.backlogPressurePercent}
            primaryDisplay={snapshot ? fmt(q.backlog) : "—"}
            label="Backlog"
            tone={gauges.backlogPressurePercent > 60 ? "warn" : "ok"}
          />
          <FlowGauge
            value={gauges.completionThroughputPercent}
            primaryDisplay={snapshot ? `${fmt(rates.completedLastMinute)}/m` : "—"}
            label="Completed / min"
            tone={rates.completedLastMinute > 0 ? "ok" : "default"}
          />
          <FlowGauge
            value={pipe.readinessStatus === 1 ? 100 : 15}
            primaryDisplay={pipe.readinessStatus === 1 ? "OK" : "Degraded"}
            label="Readiness"
            tone={pipe.readinessStatus === 1 ? "ok" : "danger"}
          />
          <FlowVerticalGauge
            value={gauges.pendingActivityPercent}
            primaryDisplay={snapshot ? fmt(q.pending) : "—"}
            label="Vertical pending"
            tone={q.pending > (gauges.pendingScaleMax || 10) * 0.6 ? "warn" : "ok"}
          />
          <FlowRangeGauge
            value={gauges.backlogPressurePercent}
            zones={BACKLOG_RANGE_ZONES}
            primaryDisplay={snapshot ? `${gauges.backlogPressurePercent ?? 0}%` : "—"}
            label="Range backlog"
          />
          <FlowVolatilityGauge
            basePercent={gauges.arrivalVolatilityPercent ?? 0}
            label="Volatility σ"
            primaryDisplay={
              snapshot && volatility.stdDevMs != null ? `${fmt(volatility.stdDevMs)} ms` : "—"
            }
          />
        </div>

        <aside className="flow-dashboard__meta" aria-label="Clocks and pipeline counters">
          <FlowAnalogClock serverUtc={snapshot?.clocks?.serverUtc} label="UTC" />
          <FlowUptimeClock uptimeSeconds={snapshot?.clocks?.uptimeSeconds} label="Uptime" />
          {sim.available && (
            <div className="flow-dashboard__sim-pill">
              <strong>Sim</strong>
              <span className={sim.enabled ? "status-ok" : "muted"}>
                {sim.enabled ? `${sim.eventsPerMinute}/min` : "Off"}
              </span>
            </div>
          )}
          <ul className="flow-dashboard__stat-stack">
            <li>
              <span className="muted">Created</span>
              <strong>{fmt(pipe.reviewsCreatedTotal)}</strong>
            </li>
            <li>
              <span className="muted">HTTP</span>
              <strong>{fmt(pipe.httpRequestsTotal)}</strong>
            </li>
            <li>
              <span className="muted">5xx</span>
              <strong>{fmt(pipe.httpErrorsTotal)}</strong>
            </li>
            <li>
              <span className="muted">Graph ∅</span>
              <strong>{fmt(pipe.graphSyncFailuresTotal)}</strong>
            </li>
            <li>
              <span className="muted">ES</span>
              <strong>{fmt(snapshot?.searchIndex?.documentCount)}</strong>
            </li>
            <li>
              <span className="muted">σ ms</span>
              <strong>{volatility.stdDevMs ?? 0}</strong>
            </li>
          </ul>
        </aside>
      </div>
    </main>
  );
}
