import {
  AGENT_FSM_STATES,
  agentRunUsedFallback,
  formatWallDuration,
  hasAgentTrace,
  labelAgentState,
} from "./agentTraceFormat";

describe("agentTraceFormat", () => {
  it("labelAgentState maps FSM ids to human labels", () => {
    expect(labelAgentState("PLAN")).toMatch(/Plan/i);
    expect(labelAgentState("UNKNOWN")).toBe("UNKNOWN");
  });

  it("hasAgentTrace detects trace documents", () => {
    expect(hasAgentTrace(null)).toBe(false);
    expect(hasAgentTrace({ statesVisited: ["INTAKE"] })).toBe(true);
    expect(hasAgentTrace({ runId: "x" })).toBe(true);
  });

  it("agentRunUsedFallback checks FALLBACK_RULES state", () => {
    expect(agentRunUsedFallback({ statesVisited: ["INTAKE", "PERSIST"] })).toBe(false);
    expect(agentRunUsedFallback({ statesVisited: ["FALLBACK_RULES"] })).toBe(true);
  });

  it("formatWallDuration formats ms and seconds", () => {
    expect(formatWallDuration(null)).toBe("—");
    expect(formatWallDuration(450)).toBe("450 ms");
    expect(formatWallDuration(2500)).toBe("2.5 s");
  });

  it("AGENT_FSM_STATES includes canonical order", () => {
    expect(AGENT_FSM_STATES).toContain("TOOL_LOOP");
    expect(AGENT_FSM_STATES).toContain("FALLBACK_RULES");
  });
});
