/**
 * Analytics dashboard — Recharts line + bar charts with legends, axis labels, and measure selector.
 *
 * Pattern: PostgreSQL review_stats_events → GET /metrics/* → Recharts ResponsiveContainer.
 * Technology: recharts library; measure query param switches event_type aggregation.
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
  Label,
} from "recharts";
import { getJson } from "../api/client";

/** Default reporting window when the user has not customized dates yet (7 days). */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Rolling window used while auto-refresh is enabled (last 24 hours). */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Poll interval while auto-refresh is on (30 seconds). */
const AUTO_REFRESH_MS = 30_000;

/** Line chart measure options — maps UI value → API measure param + axis/legend labels. */
const LINE_MEASURES = {
  ingests: {
    apiMeasure: "ingests",
    seriesName: "New review ingests",
    yAxisLabel: "Count of new reviews",
    description: "Counts review_created events — how many emails entered the triage queue.",
  },
  status_events: {
    apiMeasure: "status_events",
    seriesName: "Status transition events",
    yAxisLabel: "Count of status events",
    description:
      "Counts status_changed events — pipeline moves (pending → processing → completed/failed).",
  },
};

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
  /** bucket: controls PostgreSQL date_trunc width (15m, 1h, 1d). */
  const [bucket, setBucket] = useState("1h");
  /** lineMeasure: which event_type the line chart aggregates. */
  const [lineMeasure, setLineMeasure] = useState("ingests");
  /** autoRefresh: when true, poll PostgreSQL for the rolling last-24-hours window. */
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [series, setSeries] = useState([]);
  const [breakdown, setBreakdown] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const measureMeta = LINE_MEASURES[lineMeasure] || LINE_MEASURES.ingests;

  const applyMetrics = useCallback(
    async (from, to, bucketKey, measureKey) => {
      setLoading(true);
      setError("");
      try {
        const fromIso = from.toISOString();
        const toIso = to.toISOString();
        const apiMeasure = LINE_MEASURES[measureKey]?.apiMeasure || "ingests";
        const ts = await getJson(
          `/metrics/timeseries?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(
            toIso
          )}&bucket=${encodeURIComponent(bucketKey)}&measure=${encodeURIComponent(apiMeasure)}`
        );
        const br = await getJson(
          `/metrics/status-breakdown?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(
            toIso
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
    },
    []
  );

  const loadManualRange = useCallback(async () => {
    await applyMetrics(
      fromLocalInputValue(fromInput),
      fromLocalInputValue(toInput),
      bucket,
      lineMeasure
    );
  }, [applyMetrics, fromInput, toInput, bucket, lineMeasure]);

  const loadRolling24Hours = useCallback(async () => {
    const to = new Date();
    const from = new Date(to.getTime() - DAY_MS);
    setFromInput(toLocalInputValue(from));
    setToInput(toLocalInputValue(to));
    await applyMetrics(from, to, bucket, lineMeasure);
  }, [applyMetrics, bucket, lineMeasure]);

  useEffect(() => {
    if (autoRefresh) {
      return;
    }
    loadManualRange().catch(() => {});
  }, [autoRefresh, loadManualRange]);

  useEffect(() => {
    if (!autoRefresh) {
      return undefined;
    }
    loadRolling24Hours().catch(() => {});
    const timerId = window.setInterval(() => {
      loadRolling24Hours().catch(() => {});
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timerId);
  }, [autoRefresh, loadRolling24Hours]);

  const toggleAutoRefresh = () => {
    setAutoRefresh((enabled) => !enabled);
  };

  return (
    <section className="card" style={{ gridColumn: "1 / -1" }}>
      <h2>Traffic &amp; queue health</h2>
      <p className="muted">
        Charts read narrow rows from PostgreSQL <code>review_stats_events</code> (not full MongoDB
        documents). The line chart measure controls which <code>event_type</code> is counted; the bar
        chart always shows status labels. See{" "}
        <code>docs/ui_guide_analytics_charts.md</code>.
      </p>

      <div className="row" style={{ marginTop: "0.75rem" }}>
        <div>
          <label className="field">From</label>
          <input
            type="datetime-local"
            value={fromInput}
            disabled={autoRefresh}
            onChange={(e) => setFromInput(e.target.value)}
          />
        </div>
        <div>
          <label className="field">To</label>
          <input
            type="datetime-local"
            value={toInput}
            disabled={autoRefresh}
            onChange={(e) => setToInput(e.target.value)}
          />
        </div>
      </div>

      {autoRefresh && (
        <p className="muted" style={{ marginTop: "0.5rem" }}>
          Auto-refresh shows the rolling last 24 hours and polls every 30 seconds.
        </p>
      )}

      <div className="row" style={{ marginTop: "0.75rem" }}>
        <div>
          <label className="field">Line chart measure</label>
          <select value={lineMeasure} onChange={(e) => setLineMeasure(e.target.value)}>
            <option value="ingests">New review ingests (review_created)</option>
            <option value="status_events">Status transitions (status_changed)</option>
          </select>
          <p className="muted" style={{ fontSize: "0.85rem", marginTop: "0.35rem" }}>
            {measureMeta.description}
          </p>
        </div>
        <div>
          <label className="field">Time bucket (X-axis grouping)</label>
          <select value={bucket} onChange={(e) => setBucket(e.target.value)}>
            <option value="15m">15 minutes</option>
            <option value="1h">1 hour</option>
            <option value="1d">1 day</option>
          </select>
        </div>
        <div className="actions" style={{ alignSelf: "end" }}>
          <button
            type="button"
            className={autoRefresh ? "primary" : undefined}
            disabled={loading && autoRefresh}
            onClick={toggleAutoRefresh}
          >
            {autoRefresh ? "Auto-refresh: on" : "Auto-refresh: off"}
          </button>
          <button
            type="button"
            className="primary"
            disabled={loading || autoRefresh}
            onClick={() => loadManualRange()}
          >
            {loading ? "Loading…" : "Apply range"}
          </button>
        </div>
      </div>

      {error && <p className="status-failed">{error}</p>}

      <div style={{ marginTop: "1.25rem", width: "100%", height: 340 }}>
        <ResponsiveContainer>
          <LineChart data={series} margin={{ left: 16, right: 16, top: 16, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" minTickGap={24} tick={{ fontSize: 11 }}>
              <Label value="Time (local)" position="insideBottom" offset={-4} />
            </XAxis>
            <YAxis allowDecimals={false} width={48}>
              <Label
                value={measureMeta.yAxisLabel}
                angle={-90}
                position="insideLeft"
                style={{ textAnchor: "middle" }}
              />
            </YAxis>
            <Tooltip />
            <Legend verticalAlign="top" />
            <Line
              type="monotone"
              dataKey="count"
              stroke="#1f5eff"
              strokeWidth={2}
              dot={false}
              name={measureMeta.seriesName}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <h3 className="muted" style={{ marginTop: "1.5rem", fontSize: "0.95rem" }}>
        Status mix in the same window
      </h3>
      <p className="muted" style={{ fontSize: "0.85rem" }}>
        Each bar is a pipeline status label; height is the count of <code>status_changed</code>{" "}
        events in the selected time window (not unique reviews).
      </p>
      <div style={{ width: "100%", height: 300 }}>
        <ResponsiveContainer>
          <BarChart data={breakdown} margin={{ left: 16, right: 16, top: 16, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="status">
              <Label value="Review pipeline status" position="insideBottom" offset={-4} />
            </XAxis>
            <YAxis allowDecimals={false} width={48}>
              <Label
                value="Status event count"
                angle={-90}
                position="insideLeft"
                style={{ textAnchor: "middle" }}
              />
            </YAxis>
            <Tooltip />
            <Legend verticalAlign="top" />
            <Bar dataKey="count" fill="#5b6b8c" name="Status transition events" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
