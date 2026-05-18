/**
 * Dev simulation controls: toggles background synthetic ingests and caps events per minute.
 */
import { useEffect, useState } from "react";
import { getJson, postJson } from "../api/client";

export default function SimulationPanel({ maxPerMin }) {
  const [enabled, setEnabled] = useState(false);
  const [rate, setRate] = useState(2);
  const [status, setStatus] = useState("");

  useEffect(() => {
    getJson("/dev/simulation")
      .then((data) => {
        setEnabled(Boolean(data.simulation?.enabled));
        setRate(Number(data.simulation?.eventsPerMinute) || 2);
      })
      .catch(() => setStatus("Could not read simulation state (dev API only)."));
  }, []);

  const save = async () => {
    setStatus("Saving…");
    try {
      await postJson("/dev/simulation", {
        enabled,
        eventsPerMinute: Number(rate),
      });
      setStatus("Saved. Synthetic traffic will follow the new rate cap.");
    } catch (e) {
      setStatus(e.message || "Save failed");
    }
  };

  const resetLocalState = async () => {
    setStatus("Resetting local databases, queues, and simulation…");
    try {
      const data = await postJson("/dev/reset-local-state", {});
      setEnabled(false);
      setRate(1);
      setStatus(
        `Reset complete. Mongo reviews deleted: ${data.summary?.mongoReviewsDeleted ?? 0}.`
      );
    } catch (e) {
      setStatus(e.message || "Reset failed");
    }
  };

  return (
    <section className="card" style={{ gridColumn: "1 / -1", borderStyle: "dashed" }}>
      <h2>Simulation mode (development)</h2>
      <p className="muted">
        Runs an extra asynchronous loop inside the API process that enqueues believable test emails
        at a steady cadence. Keep the rate low on laptops; the server clamps to{" "}
        <strong>{maxPerMin}</strong> events per minute.
      </p>
      <label className="field">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />{" "}
        Enable synthetic ingests
      </label>
      <div style={{ marginTop: "0.65rem" }}>
        <label className="field">Target events per minute</label>
        <input
          type="number"
          min={1}
          max={maxPerMin}
          value={rate}
          onChange={(e) => setRate(e.target.value)}
        />
      </div>
      <div className="actions">
        <button type="button" className="primary" onClick={() => save()}>
          Update simulation
        </button>
        <button type="button" onClick={() => resetLocalState()}>
          Reset local databases & queues
        </button>
      </div>
      {status && <p className="muted">{status}</p>}
    </section>
  );
}
