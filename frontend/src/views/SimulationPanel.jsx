/**
 * Dev-only simulation controls on the Review dashboard (visible when GET /dev/features → simulation:true).
 *
 * Pattern: POST /dev/simulation → Redis state → simulationLoop.js setInterval → Mongo + Kafka.
 * UX: compact left-aligned controls; HoverHelp tooltips replace inline instruction paragraphs.
 */
import { useCallback, useEffect, useState } from "react";
import { getJson, postJson } from "../api/client";
import HoverHelp from "../components/HoverHelp";

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
          : "Simulation stopped."
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

  const toggleHelp = enabled
    ? "Stop creating synthetic emails. Your emails-per-minute setting is saved for the next start."
    : "Begin creating synthetic test emails through the same analysis pipeline as real submissions.";

  return (
    <section className="card simulation-panel" style={{ gridColumn: "1 / -1", borderStyle: "dashed" }}>
      <HoverHelp text="Development-only traffic generator. Synthetic emails flow through Kafka and Celery like analyst submissions.">
        <h2 className="simulation-panel__title">Dev simulation (synthetic emails)</h2>
      </HoverHelp>

      <div className="simulation-panel__body">
        <div className="simulation-panel__main">
          <HoverHelp
            text={
              enabled
                ? "Simulation is active — new synthetic reviews are being queued."
                : "Simulation is paused — no new synthetic reviews are created."
            }
          >
            <p
              className={`simulation-panel__status simulation-panel__status--${
                enabled ? "running" : "stopped"
              }`}
              aria-live="polite"
            >
              {enabled ? "Status: running" : "Status: stopped"}
            </p>
          </HoverHelp>

          <HoverHelp
            text={`How many synthetic emails to queue each minute. The server will not exceed ${maxPerMin} per minute on this laptop.`}
          >
            <label className="field field--stacked simulation-panel__rate">
              Emails per minute
              <input
                type="number"
                min={1}
                max={maxPerMin}
                value={rate}
                disabled={busy}
                onChange={(e) => setRate(e.target.value)}
              />
            </label>
          </HoverHelp>

          <div className="simulation-panel__actions">
            <HoverHelp text={toggleHelp}>
              <button
                type="button"
                className={enabled ? "simulation-panel__btn-stop" : "primary"}
                disabled={busy}
                onClick={() => toggleRunning().catch(() => {})}
              >
                {enabled ? "Stop simulation" : "Start simulation"}
              </button>
            </HoverHelp>
            {enabled && (
              <HoverHelp text="Save a new emails-per-minute value while simulation keeps running.">
                <button
                  type="button"
                  disabled={busy || !rateChangedWhileRunning}
                  onClick={() => applyRate().catch(() => {})}
                >
                  Apply rate
                </button>
              </HoverHelp>
            )}
          </div>
        </div>
      </div>

      <details className="simulation-panel__reset">
        <summary>
          <HoverHelp text="Deletes all local review data, clears queues and graph, and stops simulation. Cannot be undone.">
            <span>Reset local databases &amp; queues (destructive)</span>
          </HoverHelp>
        </summary>
        <div className="simulation-panel__actions">
          <HoverHelp text="Wipes MongoDB reviews, PostgreSQL chart stats, Redis, Kafka topics, Neo4j, and analytics export tables.">
            <button type="button" disabled={busy} onClick={() => resetLocalState().catch(() => {})}>
              Reset local databases &amp; queues
            </button>
          </HoverHelp>
        </div>
      </details>

      {status && (
        <p className="simulation-panel__feedback muted" role="status">
          {status}
        </p>
      )}
    </section>
  );
}
