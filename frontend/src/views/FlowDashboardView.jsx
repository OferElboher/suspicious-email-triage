/**
 * Live flow dashboard — gauges and clocks for inbound review pipeline (SOC-style).
 *
 * Pattern: poll GET /metrics/flow-dashboard every 3s; needles and clock hands animate via CSS/SVG.
 * Technology: FlowGauge (SVG), FlowAnalogClock, FlowUptimeClock, useFlowDashboardPoll hook.
 * Dev simulation increases ingest/backlog gauges when synthetic emails enter the queue.
 */
import FlowGauge from "../components/FlowGauge";
import FlowAnalogClock from "../components/FlowAnalogClock";
import FlowUptimeClock from "../components/FlowUptimeClock";
import HoverHelp from "../components/HoverHelp";
import { useFlowDashboardPoll } from "../hooks/useFlowDashboardPoll";

/** Format integer counts for gauge detail captions. */
function fmt(n) {
  return Number(n || 0).toLocaleString();
}

/** Live flow sub-window (#flow) — metrics.read permission. */
export default function FlowDashboardView() {
  const { snapshot, loading, error, refresh } = useFlowDashboardPoll({ enabled: true });

  const q = snapshot?.queue || {};
  const rates = snapshot?.rates || {};
  const gauges = snapshot?.gauges || {};
  const sim = snapshot?.simulation || {};
  const pipe = snapshot?.pipeline || {};
  const awaitingFirstSnapshot = !snapshot && loading;

  return (
    <main className="layout layout--single flow-dashboard">
      <section className="card flow-dashboard__header">
        <HoverHelp text="Real-time view of review queue depth, ingest rate, and pipeline health. Gauges refresh every 3 seconds — start dev simulation on the Review dashboard to watch needles move.">
          <h2>Live flow dashboard</h2>
        </HoverHelp>
        <p className="muted">
          Gauges show MongoDB queue depths and ingest rates; clocks show API server time and uptime.
          During <strong>dev simulation</strong>, the ingest and backlog needles rise as synthetic emails
          enter the pipeline (pending → processing → completed). Large <em>completed</em> history no longer
          pins share-based needles at 0% — activity scales use the configured simulation rate.
        </p>
        <div className="toolbar flow-dashboard__toolbar">
          <HoverHelp text="Immediately fetch a new snapshot from GET /metrics/flow-dashboard.">
            <button type="button" disabled={loading} onClick={() => refresh().catch(() => {})}>
              {loading ? "Refreshing…" : "Refresh now"}
            </button>
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
            <span className="muted">5m avg ingest</span>
            <strong>{rates.createdPerMinuteAvg5m ?? 0}/min</strong>
          </li>
        </ul>
      </section>
    </main>
  );
}
