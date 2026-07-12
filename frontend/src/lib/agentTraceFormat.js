/**
 * Agent trace formatting helpers for the Agent Activity UI.
 *
 * Pattern: pure functions — no API calls; keeps visualization components testable.
 * Technology: maps Mongo agentTrace FSM fields to human-readable labels.
 */

/** Canonical FSM state order for timeline visualization. */
export const AGENT_FSM_STATES = [
  "INTAKE",
  "PLAN",
  "TOOL_LOOP",
  "SYNTHESIZE",
  "GUARD_VALIDATE",
  "PERSIST",
  "FALLBACK_RULES",
];

/**
 * @param {string} state — FSM state id
 * @returns {string} short label for UI
 */
export function labelAgentState(state) {
  const labels = {
    INTAKE: "Intake & guardrails",
    PLAN: "Plan sub-tasks",
    TOOL_LOOP: "Run tools",
    SYNTHESIZE: "Synthesize verdict",
    GUARD_VALIDATE: "Validate output",
    PERSIST: "Save results",
    FALLBACK_RULES: "Rule-only fallback",
  };
  return labels[state] || state;
}

/**
 * @param {object|null} trace — review.agentTrace
 * @returns {boolean}
 */
export function hasAgentTrace(trace) {
  return Boolean(trace && (trace.statesVisited?.length || trace.runId));
}

/**
 * @param {object|null} trace
 * @returns {boolean} true when guardrails or LLM forced rule-only path
 */
export function agentRunUsedFallback(trace) {
  return Boolean(trace?.statesVisited?.includes("FALLBACK_RULES"));
}

/**
 * @param {number|null|undefined} ms
 * @returns {string}
 */
export function formatWallDuration(ms) {
  if (ms == null || Number.isNaN(ms)) {
    return "—";
  }
  if (ms < 1000) {
    return `${ms} ms`;
  }
  return `${(ms / 1000).toFixed(1)} s`;
}
