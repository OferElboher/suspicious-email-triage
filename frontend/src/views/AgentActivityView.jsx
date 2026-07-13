/**
 * Agent Activity sub-window (#agent) — fleet view of recent agent FSM runs.
 *
 * Pattern: polls GET /metrics/agent-triage (metrics.read); complements per-review AgentTracePanel.
 * Technology: React state + manual refresh; capped backend query (25 rows max).
 */
import { useCallback, useEffect, useState } from "react";
import { getJson } from "../api/client";
import HoverHelp from "../components/HoverHelp";
import { formatWallDuration, labelAgentState } from "../lib/agentTraceFormat";

/** Load agent activity snapshot from the metrics API. */
export default function AgentActivityView() {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getJson("/metrics/agent-triage");
      setSnapshot(data);
      setError("");
    } catch (err) {
      setError(err.message || "Agent activity unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  const summary = snapshot?.summary || {};
  const limits = snapshot?.safetyLimits || {};

  return (
    <main className="layout layout--single agent-activity-view" data-testid="agent-activity-view">
      <section className="card">
        <HoverHelp text="Read-only view of bounded agent FSM runs. Backend caps Mongo reads and tool/LLM loops. See ui_guide_agent_activity.md.">
          <h2>Agent activity</h2>
        </HoverHelp>

        <div className="toolbar agent-activity-view__toolbar">
          <button type="button" onClick={() => refresh()} disabled={loading}>
            {loading ? "…" : "Refresh"}
          </button>
          {snapshot && (
            <span className="muted">
              Agent scoring {snapshot.agentEnabled ? "enabled" : "disabled"} · provider{" "}
              {snapshot.cloudProvider || "mock"}
            </span>
          )}
        </div>

        {error && <p className="status-failed">{error}</p>}

        {snapshot && (
          <>
            <div className="agent-activity-view__safety card agent-activity-view__safety-card">
              <h3>Safety limits (server config)</h3>
              <p className="muted">
                These caps protect Celery workers in every environment — they prevent unbounded
                LLM loops, oversized prompts, and long HTTP tool calls.
              </p>
              <ul className="agent-activity-view__limits">
                <li>
                  Max tool steps: <strong>{limits.maxToolSteps ?? 3}</strong>
                </li>
                <li>
                  Max wall time: <strong>{formatWallDuration(limits.maxWallMs)}</strong>
                </li>
                <li>
                  Max body chars: <strong>{limits.maxBodyChars ?? 8000}</strong>
                </li>
              </ul>
            </div>

            <div className="agent-activity-view__stats">
              <div className="agent-activity-view__stat">
                <span className="agent-activity-view__stat-value">
                  {summary.reviewsWithTrace ?? 0}
                </span>
                <span className="muted">Reviews with agent trace</span>
              </div>
              <div className="agent-activity-view__stat">
                <span className="agent-activity-view__stat-value">
                  {summary.recentFallbacks ?? 0}
                </span>
                <span className="muted">Fallbacks (recent sample)</span>
              </div>
              <div className="agent-activity-view__stat">
                <span className="agent-activity-view__stat-value">
                  {formatWallDuration(summary.avgWallDurationMs)}
                </span>
                <span className="muted">Avg duration (sample)</span>
              </div>
            </div>

            {!snapshot.agentEnabled && (
              <p className="agent-activity-view__hint muted" role="status">
                Set <code>AGENT_TRIAGE_ENABLED=true</code> on the Celery worker and recreate{" "}
                <code>ai-celery</code> to record new traces. Existing rows below are historical.
              </p>
            )}

            <h3>Recent agent runs</h3>
            {summary.recentSampleSize === 0 ? (
              <p className="muted">No agent traces yet — submit a review with agent mode enabled.</p>
            ) : (
              <div className="agent-activity-view__table-wrap">
                <table className="agent-activity-view__table">
                  <thead>
                    <tr>
                      <th>Subject</th>
                      <th>Verdict</th>
                      <th>States</th>
                      <th>Tools</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(snapshot.recentRuns || []).map((run) => (
                      <tr
                        key={run.runId || run.reviewId}
                        className={run.fallback ? "agent-activity-view__row--fallback" : ""}
                      >
                        <td>
                          <span className="agent-activity-view__subject">{run.subject || "—"}</span>
                          <span className="muted agent-activity-view__sender">{run.senderEmail}</span>
                        </td>
                        <td>{run.verdict || "—"}</td>
                        <td>
                          <span className="agent-activity-view__states">
                            {(run.statesVisited || [])
                              .filter((s) => s !== "FALLBACK_RULES")
                              .map((s) => labelAgentState(s).split(" ")[0])
                              .join(" → ")}
                            {run.fallback ? " → fallback" : ""}
                          </span>
                        </td>
                        <td>{(run.toolCalls || []).map((t) => t.name).join(", ") || "—"}</td>
                        <td>{formatWallDuration(run.wallDurationMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
