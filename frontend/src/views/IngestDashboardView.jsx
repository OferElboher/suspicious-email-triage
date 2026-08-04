/**
 * Mailbox ingest dashboard — statistics and charts for the Go ingest-gateway service.
 *
 * Shows webhook vs simulation throughput, error counts, and dev simulation controls.
 * Pattern: polls GET /metrics/mailbox-ingest (Node proxy → Go gateway).
 */
import { useCallback, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import HoverHelp from "../components/HoverHelp";
import VerdictDeliveryPanel from "../components/VerdictDeliveryPanel";
import { useMailboxIngestPoll } from "../hooks/useMailboxIngestPoll";
import { useVerdictDeliveryPoll } from "../hooks/useVerdictDeliveryPoll";
import { postJson } from "../api/client";

/** Format counts for stat cards. */
function fmt(n) {
  return Number(n || 0).toLocaleString();
}

/**
 * @param {object} props
 * @param {boolean} props.canSimulate — dev mailbox simulation controls
 * @param {number} props.maxEventsPerMin — cap from GET /dev/features
 */
export default function IngestDashboardView({ canSimulate, maxEventsPerMin = 30 }) {
  const { snapshot, loading, error, refresh } = useMailboxIngestPoll({ enabled: true });
  const verdictPoll = useVerdictDeliveryPoll({ enabled: true, intervalMs: 6000 });
  const [simRate, setSimRate] = useState(5);
  const [simMessage, setSimMessage] = useState("");
  /** simBusy: true while start/stop POST is in flight — disables toggle and rate input. */
  const [simBusy, setSimBusy] = useState(false);

  const totals = snapshot?.totals || {};
  const rates = snapshot?.rates || {};
  /** simulationEnabled: from Go gateway snapshot — drives toggle label and rate field lock. */
  const simulationEnabled = Boolean(rates.simulationEnabled);
  const series = snapshot?.series?.perMinute || [];
  const chartData = series.map((row) => ({
    minute: new Date(row.minute).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    received: row.received,
    simulation: row.simulation,
    webhook: row.webhook,
    errors: row.errors,
  }));

  /** toggleSimulation — single Start/Stop control (same naming as Node Dev simulation card). */
  const toggleSimulation = useCallback(async () => {
    setSimMessage("");
    setSimBusy(true);
    try {
      if (simulationEnabled) {
        await postJson("/metrics/mailbox-ingest/simulation", { action: "stop" });
        setSimMessage("Simulation stopped");
      } else {
        const result = await postJson("/metrics/mailbox-ingest/simulation", {
          action: "start",
          emailsPerMinute: simRate,
        });
        setSimMessage(`Simulation running at ${result.emailsPerMinute || simRate}/min`);
      }
      await refresh();
    } catch (err) {
      setSimMessage(err.message || (simulationEnabled ? "Failed to stop simulation" : "Failed to start simulation"));
    } finally {
      setSimBusy(false);
    }
  }, [simRate, refresh, simulationEnabled]);

  if (snapshot?.enabled === false) {
    return (
      <main className="layout layout--single ingest-dashboard">
        <h2>Mailbox ingest</h2>
        <p className="muted">Mailbox ingest gateway is disabled in this environment.</p>
      </main>
    );
  }

  return (
    <main className="layout layout--single ingest-dashboard" data-testid="ingest-dashboard-view">
      <header className="ingest-dashboard__top">
        <HoverHelp text="Go ingest-gateway receives email-shaped HTTP payloads (or dev simulation), persists reviews via Node internal API, and enqueues the same Kafka topic as manual triage.">
          <h2 className="ingest-dashboard__title">Mailbox ingest gateway</h2>
        </HoverHelp>
        <div className="toolbar">
          <button type="button" disabled={loading} onClick={() => refresh().catch(() => {})}>
            {loading ? "…" : "Refresh"}
          </button>
        </div>
      </header>

      {error && <p className="error-banner">{error}</p>}
      {snapshot?.reachable === false && (
        <p className="warn-banner">Go ingest-gateway unreachable: {snapshot.error}</p>
      )}

      <section className="ingest-dashboard__stats card-grid">
        <div className="stat-card">
          <span className="stat-label">Total received</span>
          <strong>{fmt(totals.received)}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Webhook ingest</span>
          <strong>{fmt(totals.webhook)}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Simulation ingest</span>
          <strong>{fmt(totals.simulation)}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Errors</span>
          <strong>{fmt(totals.errors)}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Last minute</span>
          <strong>{fmt(rates.lastMinuteReceived)}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Uptime (s)</span>
          <strong>{fmt(snapshot?.uptimeSeconds)}</strong>
        </div>
      </section>

      {canSimulate && (
        <section className="ingest-dashboard__sim card">
          <h3>Dev simulation (Go gateway)</h3>
          <p className="muted">
            Generates synthetic mailbox emails at a configurable rate (max {maxEventsPerMin}/min).
            Rotates phishing demo templates (URL phish, credential keywords, urgent link, benign).
          </p>
          <div className="ingest-dashboard__sim-row">
            <label className="ingest-dashboard__sim-rate">
              Emails/min
              <input
                type="number"
                min={1}
                max={maxEventsPerMin}
                value={simRate}
                disabled={simBusy || simulationEnabled}
                onChange={(e) => setSimRate(Number(e.target.value) || 1)}
              />
            </label>
            <button
              type="button"
              className={
                simulationEnabled
                  ? "ingest-dashboard__sim-toggle ingest-dashboard__sim-toggle--stop"
                  : "ingest-dashboard__sim-toggle primary"
              }
              disabled={simBusy}
              onClick={() => toggleSimulation().catch(() => {})}
            >
              {simulationEnabled ? "Stop simulation" : "Start simulation"}
            </button>
          </div>
          {rates.simulationEnabled && (
            <p className="ok-banner">Simulation active at {rates.simulationEmailsPerMinute}/min</p>
          )}
          {simMessage && <p className="muted">{simMessage}</p>}
        </section>
      )}

      <section className="ingest-dashboard__chart card">
        <h3>Per-minute activity</h3>
        <div style={{ width: "100%", height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="minute" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="webhook" stackId="a" fill="#3b82f6" name="Webhook" />
              <Bar dataKey="simulation" stackId="a" fill="#8b5cf6" name="Simulation" />
              <Bar dataKey="errors" fill="#ef4444" name="Errors" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <VerdictDeliveryPanel
        snapshot={verdictPoll.snapshot}
        loading={verdictPoll.loading}
        error={verdictPoll.error}
      />
    </main>
  );
}
