import { render, screen } from "@testing-library/react";
import AgentTracePanel from "./AgentTracePanel";

describe("AgentTracePanel", () => {
  it("renders nothing when trace is absent", () => {
    const { container } = render(<AgentTracePanel trace={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders FSM timeline and tool calls when agentTrace is present", () => {
    render(
      <AgentTracePanel
        trace={{
          runId: "run-abc",
          provider: "mock",
          modelId: "mock",
          wallDurationMs: 450,
          statesVisited: ["INTAKE", "PLAN", "TOOL_LOOP", "PERSIST"],
          toolCalls: [{ name: "run_rule_engine", ok: true, latencyMs: 3 }],
          guardrailEvents: [{ stage: "pre", rule: "pii_mask", action: "redacted" }],
          plan: { intent: "investigate_suspicious_email", riskHypothesis: "phish" },
        }}
      />
    );

    expect(screen.getByTestId("agent-trace-panel")).toBeInTheDocument();
    expect(screen.getByText(/Agent triage trace/i)).toBeInTheDocument();
    expect(screen.getByText(/run_rule_engine/i)).toBeInTheDocument();
    expect(screen.getByText(/450 ms/i)).toBeInTheDocument();
    expect(screen.getByText(/investigate_suspicious_email/i)).toBeInTheDocument();
  });

  it("shows fallback banner when FALLBACK_RULES was visited", () => {
    render(
      <AgentTracePanel
        trace={{
          runId: "run-fb",
          statesVisited: ["INTAKE", "FALLBACK_RULES"],
          toolCalls: [],
          guardrailEvents: [],
        }}
      />
    );
    expect(screen.getByRole("status")).toHaveTextContent(/guardrail or LLM step/i);
  });
});
