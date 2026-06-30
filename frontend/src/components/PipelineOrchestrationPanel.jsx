/**
 * Pipeline orchestration panel — Prefect health check + dbt daily rollup chart on Analytics tab.
 *
 * Pattern: React fetches GET /pipeline/* (Express) which bridges Prefect Python flow and dbt VIEW.
 * Technology: Recharts bar chart for dbt model output; status badges for Prefect flow result.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Label,
} from "recharts";
import { getJson } from "../api/client";

/** Map Prefect flow status to human-readable badge class. */
function statusClass(status) {
  if (status === "ok") {
    return "status-ok";
  }
  if (status === "no_events") {
    return "status-warn";
  }
  return "muted";
}

/** Panel showing data-platform orchestration wired into the triage analytics screen. */
export default function PipelineOrchestrationPanel() {
  const [prefect, setPrefect] = useState(null);
  const [dbt, setDbt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [prefectData, dbtData] = await Promise.all([
        getJson("/pipeline/prefect-health?hours=24"),
        getJson("/pipeline/dbt-daily?limit=14"),
      ]);
      setPrefect(prefectData);
      setDbt({
        ...dbtData,
        chartRows: [...(dbtData.rows || [])].reverse(),
      });
    } catch (e) {
      setError(e.message || "Failed to load pipeline orchestration data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  return (
    <section className="card pipeline-panel" style={{ marginTop: "1.5rem" }}>
      <h2>Data pipeline (Prefect &amp; dbt)</h2>
      <p className="muted">
        This section reads orchestration outputs that power analytics engineering workflows: a{" "}
        <strong>Prefect</strong> flow checks whether stats events arrived recently, and a{" "}
        <strong>dbt</strong> model rolls raw events up by calendar day. See{" "}
        <code>docs/data_guide_prefect_dbt_demo.md</code>.
      </p>

      {error && <p className="status-failed">{error}</p>}

      <div className="pipeline-panel__grid">
        <div className="pipeline-panel__card">
          <h3 className="pipeline-panel__title">Prefect — review-stats-health-check</h3>
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            Prefect orchestrates Python <code>@task</code> / <code>@flow</code> workflows with retries
            and observability. This flow counts <code>review_stats_events</code> in the last 24 hours.
          </p>
          {loading && !prefect && <p className="muted">Loading Prefect health…</p>}
          {prefect && (
            <ul className="pipeline-panel__metrics">
              <li>
                <span className="muted">Events in window</span>
                <strong>{prefect.eventCount}</strong>
              </li>
              <li>
                <span className="muted">Window (hours)</span>
                <strong>{prefect.hours}</strong>
              </li>
              <li>
                <span className="muted">Status</span>
                <strong className={statusClass(prefect.status)}>{prefect.status}</strong>
              </li>
              <li>
                <span className="muted">Executed via</span>
                <strong>{prefect.source}</strong>
              </li>
              <li>
                <span className="muted">Flow name</span>
                <code>{prefect.flowName}</code>
              </li>
            </ul>
          )}
        </div>

        <div className="pipeline-panel__card pipeline-panel__chart">
          <h3 className="pipeline-panel__title">dbt — review_stats_daily model</h3>
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            dbt compiles versioned SQL models against Postgres. Model{" "}
            <code>review_stats_daily</code> groups events by day (<code>date_trunc</code>).
          </p>
          {loading && !dbt && <p className="muted">Loading dbt rollup…</p>}
          {dbt && (
            <>
              <p className="muted" style={{ fontSize: "0.82rem" }}>
                Project <code>{dbt.project}</code> · materialization{" "}
                <code>{dbt.materialization}</code>
              </p>
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={dbt.chartRows || []} margin={{ left: 12, right: 12, top: 12, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" minTickGap={8} tick={{ fontSize: 10 }}>
                      <Label value="Calendar day (dbt stats_day)" position="insideBottom" offset={-4} />
                    </XAxis>
                    <YAxis allowDecimals={false} width={44}>
                      <Label
                        value="Event count (dbt event_count)"
                        angle={-90}
                        position="insideLeft"
                        style={{ textAnchor: "middle" }}
                      />
                    </YAxis>
                    <Tooltip />
                    <Legend verticalAlign="top" />
                    <Bar
                      dataKey="event_count"
                      fill="#2ecc71"
                      name="Daily events (dbt model)"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="actions" style={{ marginTop: "0.75rem" }}>
        <button type="button" disabled={loading} onClick={() => load()}>
          {loading ? "Refreshing…" : "Refresh pipeline data"}
        </button>
      </div>
    </section>
  );
}
