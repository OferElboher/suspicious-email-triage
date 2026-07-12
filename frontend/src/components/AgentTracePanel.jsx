/**
 * Per-review agent FSM visualization — timeline, tools, guardrails.
 *
 * Pattern: embedded in ReviewDetailPanel when Mongo document includes agentTrace.
 * Technology: CSS step timeline; data from GET /reviews/:id (no extra API call).
 */
import HoverHelp from "./HoverHelp";
import {
  AGENT_FSM_STATES,
  agentRunUsedFallback,
  formatWallDuration,
  hasAgentTrace,
  labelAgentState,
} from "../lib/agentTraceFormat";

/**
 * @param {object} props
 * @param {object|null} props.trace — review.agentTrace sub-document
 */
export default function AgentTracePanel({ trace }) {
  if (!hasAgentTrace(trace)) {
    return null;
  }

  const visited = new Set(trace.statesVisited || []);
  const fallback = agentRunUsedFallback(trace);

  return (
    <section
      className="agent-trace-panel"
      data-testid="agent-trace-panel"
      aria-label="Agent triage trace"
    >
      <HoverHelp text="Bounded FSM orchestration: PLAN → tools → SYNTHESIZE with pre/post guardrails. See data_guide_agent_triage.md.">
        <h3 className="muted review-detail-panel__subtitle">Agent triage trace</h3>
      </HoverHelp>

      <dl className="agent-trace-panel__meta">
        <div>
          <dt>Provider</dt>
          <dd>{trace.provider || "—"}</dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>{trace.modelId || "—"}</dd>
        </div>
        <div>
          <dt>Duration</dt>
          <dd>{formatWallDuration(trace.wallDurationMs)}</dd>
        </div>
        <div>
          <dt>Run id</dt>
          <dd className="agent-trace-panel__mono">{trace.runId || "—"}</dd>
        </div>
      </dl>

      {fallback && (
        <p className="agent-trace-panel__banner agent-trace-panel__banner--warn" role="status">
          Rule-only fallback — guardrail or LLM step did not produce a trusted synthesis.
        </p>
      )}

      <h4 className="agent-trace-panel__heading">FSM states visited</h4>
      <ol className="agent-trace-panel__timeline">
        {AGENT_FSM_STATES.filter((s) => visited.has(s)).map((state) => (
          <li
            key={state}
            className={`agent-trace-panel__step${
              state === "FALLBACK_RULES" ? " agent-trace-panel__step--warn" : ""
            }`}
          >
            <span className="agent-trace-panel__step-dot" aria-hidden="true" />
            <span className="agent-trace-panel__step-label">{labelAgentState(state)}</span>
            <span className="agent-trace-panel__step-id muted">{state}</span>
          </li>
        ))}
      </ol>

      {(trace.toolCalls || []).length > 0 && (
        <>
          <h4 className="agent-trace-panel__heading">Tool calls</h4>
          <ul className="agent-trace-panel__tools">
            {(trace.toolCalls || []).map((call, index) => (
              <li
                key={`${call.name}-${index}`}
                className={call.ok ? "" : "agent-trace-panel__tool--fail"}
              >
                <strong>{call.name}</strong>
                <span className="muted">
                  {call.ok ? "ok" : "failed"}
                  {call.latencyMs != null ? ` · ${call.latencyMs} ms` : ""}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {(trace.guardrailEvents || []).length > 0 && (
        <>
          <h4 className="agent-trace-panel__heading">Guardrail events</h4>
          <ul className="agent-trace-panel__guardrails">
            {(trace.guardrailEvents || []).map((ev, index) => (
              <li key={index}>
                <span className="agent-trace-panel__guard-stage">{ev.stage || "—"}</span>
                <strong>{ev.rule}</strong>
                <span className="muted">{ev.action}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {trace.plan?.intent && (
        <p className="muted agent-trace-panel__plan">
          <strong>Plan intent:</strong> {trace.plan.intent}
          {trace.plan.riskHypothesis ? ` · ${trace.plan.riskHypothesis}` : ""}
        </p>
      )}
    </section>
  );
}
