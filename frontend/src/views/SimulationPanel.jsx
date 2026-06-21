/**
 * Dev-only simulation controls in the Triage workspace (visible when GET /dev/features → simulation:true).
 *
 * Pattern: POST /dev/simulation writes { enabled, eventsPerMinute } to Redis; the Node API process
 * runs simulationLoop.js (setInterval) to insert Mongo reviews tagged source:dev_simulation and
 * publish Kafka ingest events — same async path as analyst submissions.
 *
 * UX: left-aligned instructions, status badge, one Start/Stop button; rate persists across stop/start.
 */
import { useCallback, useEffect, useState } from "react";
import { getJson, postJson } from "../api/client";

/** POST /dev/simulation with the current enabled flag and events-per-minute cap. */
async function persistSimulation(enabled, eventsPerMinute) {
  return postJson("/dev/simulation", {
    enabled,
    eventsPerMinute: Number(eventsPerMinute),
  });
}

/**
 * @param {object} props
 * @param {number} props.maxPerMin — server-side clamp from GET /dev/features (default 30)
 */
export default function SimulationPanel({ maxPerMin }) {
  const [enabled, setEnabled] = useState(false);
  const [rate, setRate] = useState(2);
  const [savedRate, setSavedRate] = useState(2);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  /** Hydrate toggle + rate from Redis on mount (dev API only). */
  useEffect(() => {
    getJson("/dev/simulation")
      .then((data) => {
        const sim = data.simulation || {};
        const perMin = Number(sim.eventsPerMinute) || 2;
        setEnabled(Boolean(sim.enabled));
        setRate(perMin);
        setSavedRate(perMin);
      })
      .catch(() => setStatus("Could not read simulation state (dev deployment + admin role required)."));
  }, []);

  /** Single Start/Stop control — flips enabled while keeping the configured rate. */
  const toggleRunning = useCallback(async () => {
    const nextEnabled = !enabled;
    setBusy(true);
    setStatus(nextEnabled ? "Starting simulation…" : "Stopping simulation…");
    try {
      await persistSimulation(nextEnabled, rate);
      setEnabled(nextEnabled);
      setSavedRate(Number(rate));
      setStatus(
        nextEnabled
          ? `Simulation is running at ${rate} email(s) per minute.`
          : "Simulation stopped. Click Start simulation to resume at the same rate."
      );
    } catch (e) {
      setStatus(e.message || "Could not update simulation state.");
    } finally {
      setBusy(false);
    }
  }, [enabled, rate]);

  /** Apply a new rate while simulation is already running (enabled stays true). */
  const applyRate = useCallback(async () => {
    setBusy(true);
    setStatus("Applying new rate…");
    try {
      await persistSimulation(true, rate);
      setSavedRate(Number(rate));
      setStatus(`Rate updated — simulation running at ${rate} email(s) per minute.`);
    } catch (e) {
      setStatus(e.message || "Could not apply rate.");
    } finally {
      setBusy(false);
    }
  }, [rate]);

  /** Destructive dev reset — clears Mongo, Redis, Kafka, Neo4j, stats; stops simulation. */
  const resetLocalState = useCallback(async () => {
    if (
      !window.confirm(
        "Reset ALL local reviews, queues, graph data, and chart stats? This cannot be undone."
      )
    ) {
      return;
    }
    setBusy(true);
    setStatus("Resetting local databases, queues, and simulation…");
    try {
      const data = await postJson("/dev/reset-local-state", {});
      setEnabled(false);
      setRate(1);
      setSavedRate(1);
      setStatus(
        `Reset complete. Mongo reviews deleted: ${data.summary?.mongoReviewsDeleted ?? 0}. Simulation is stopped.`
      );
    } catch (e) {
      setStatus(e.message || "Reset failed.");
    } finally {
      setBusy(false);
    }
  }, []);

  const rateChangedWhileRunning = enabled && Number(rate) !== Number(savedRate);

  return (
    <section className="card simulation-panel" style={{ gridColumn: "1 / -1", borderStyle: "dashed" }}>
      <h2>Dev simulation (synthetic emails)</h2>

      <div className="simulation-panel__body">
        <div className="simulation-panel__main">
          <p
            className={`simulation-panel__status simulation-panel__status--${
              enabled ? "running" : "stopped"
            }`}
            aria-live="polite"
          >
            {enabled ? "Status: running" : "Status: stopped"}
          </p>

          <ol className="simulation-panel__steps">
            <li>
              Choose how many fake emails per minute (max <strong>{maxPerMin}</strong> — server clamp
              protects laptops).
            </li>
            <li>
              Click <strong>Start simulation</strong> to begin, or <strong>Stop simulation</strong> to
              pause (your rate setting is remembered).
            </li>
            <li>
              Find synthetic rows in <strong>Recent reviews</strong> (tick “Show simulation traffic”),
              <strong> Search past reviews</strong>, <strong> Search unified logs</strong>, and{" "}
              <strong>Analytics &amp; graphs</strong> (see project doc{" "}
              <code>docs/stack_guide_dev_simulation.md</code>).
            </li>
          </ol>

          <label className="field field--stacked simulation-panel__rate">
            Emails per minute
            <input
              type="number"
              min={1}
              max={maxPerMin}
              value={rate}
              disabled={busy}
              onChange={(e) => setRate(e.target.value)}
              aria-describedby="simulation-rate-hint"
            />
          </label>
          <p id="simulation-rate-hint" className="muted simulation-panel__hint">
            {enabled
              ? "Change the number then click Apply rate while simulation is running."
              : "Rate takes effect the next time you click Start simulation."}
          </p>

          <div className="simulation-panel__actions">
            <button
              type="button"
              className={enabled ? "simulation-panel__btn-stop" : "primary"}
              disabled={busy}
              onClick={() => toggleRunning().catch(() => {})}
            >
              {enabled ? "Stop simulation" : "Start simulation"}
            </button>
            {enabled && (
              <button
                type="button"
                disabled={busy || !rateChangedWhileRunning}
                onClick={() => applyRate().catch(() => {})}
              >
                Apply rate
              </button>
            )}
          </div>
        </div>
      </div>

      <details className="simulation-panel__reset">
        <summary>Reset local databases &amp; queues (destructive)</summary>
        <p className="muted">
          Stops simulation and wipes local Mongo reviews, PostgreSQL chart stats, Redis queues, Kafka
          topics, Neo4j graph, and mock Snowflake analytics. Dev only.
        </p>
        <div className="simulation-panel__actions">
          <button type="button" disabled={busy} onClick={() => resetLocalState().catch(() => {})}>
            Reset local databases &amp; queues
          </button>
        </div>
      </details>

      {status && (
        <p className="simulation-panel__feedback muted" role="status">
          {status}
        </p>
      )}
    </section>
  );
};
