/**
 * Analytics dashboard: charts for ingest volume and status mix; filters call GET /metrics/*.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import { getJson } from "../api/client";

/** Default reporting window when the user has not customized dates yet (7 days). */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Formats a Date for datetime-local inputs (local, no timezone suffix). */
function toLocalInputValue(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

/** Parses datetime-local value back to Date (local interpretation). */
function fromLocalInputValue(s) {
  return new Date(s);
}

export default function AnalyticsView() {
  const now = useMemo(() => new Date(), []);
  const [fromInput, setFromInput] = useState(() =>
    toLocalInputValue(new Date(now.getTime() - WEEK_MS))
  );
  const [toInput, setToInput] = useState(() => toLocalInputValue(now));
  /** bucket: controls Mongo $dateTrunc width (15m, 1h, 1d). */
  const [bucket, setBucket] = useState("1h");
  const [series, setSeries] = useState([]);
  const [breakdown, setBreakdown] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const from = fromLocalInputValue(fromInput).toISOString();
      const to = fromLocalInputValue(toInput).toISOString();
      const ts = await getJson(
        `/metrics/timeseries?from=${encodeURIComponent(from)}&to=${encodeURIComponent(
          to
        )}&bucket=${encodeURIComponent(bucket)}`
      );
      const br = await getJson(
        `/metrics/status-breakdown?from=${encodeURIComponent(from)}&to=${encodeURIComponent(
          to
        )}`
      );
      setSeries(
        (ts.series || []).map((row) => ({
          ...row,
          label: row.t ? new Date(row.t).toLocaleString() : "",
        }))
      );
      setBreakdown(br.breakdown || []);
    } catch (e) {
      setError(e.message || "Failed to load metrics");
    } finally {
      setLoading(false);
    }
  }, [fromInput, toInput, bucket]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  return (
    <section className="card" style={{ gridColumn: "1 / -1" }}>
      <h2>Traffic & queue health</h2>
      <p className="muted">
        Charts count new reviews entering the system (created timestamps). Adjust the window and
        bucket size to match the story you are telling (incident hour vs weekly trend).
      </p>

      <div className="row" style={{ marginTop: "0.75rem" }}>
        <div>
          <label className="field">From</label>
          <input type="datetime-local" value={fromInput} onChange={(e) => setFromInput(e.target.value)} />
        </div>
        <div>
          <label className="field">To</label>
          <input type="datetime-local" value={toInput} onChange={(e) => setToInput(e.target.value)} />
        </div>
      </div>

      <div className="row" style={{ marginTop: "0.75rem" }}>
        <div>
          <label className="field">Bucket size</label>
          <select value={bucket} onChange={(e) => setBucket(e.target.value)}>
            <option value="15m">15 minutes</option>
            <option value="1h">1 hour</option>
            <option value="1d">1 day</option>
          </select>
        </div>
        <div className="actions" style={{ alignSelf: "end" }}>
          <button type="button" className="primary" disabled={loading} onClick={() => load()}>
            {loading ? "Loading…" : "Apply range"}
          </button>
        </div>
      </div>

      {error && <p className="status-failed">{error}</p>}

      <div style={{ marginTop: "1.25rem", width: "100%", height: 320 }}>
        <ResponsiveContainer>
          <LineChart data={series} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" minTickGap={24} tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} width={40} />
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke="#1f5eff" strokeWidth={2} dot={false} name="Ingests" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <h3 className="muted" style={{ marginTop: "1.5rem", fontSize: "0.95rem" }}>
        Status mix in the same window
      </h3>
      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <BarChart data={breakdown} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="status" />
            <YAxis allowDecimals={false} width={40} />
            <Tooltip />
            <Legend />
            <Bar dataKey="count" fill="#5b6b8c" name="Reviews" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
