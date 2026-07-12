import { render, screen } from "@testing-library/react";
import ReviewDetailPanel from "./ReviewDetailPanel";

describe("ReviewDetailPanel", () => {
  it("shows placeholder when no review is selected", () => {
    render(
      <ReviewDetailPanel
        review={null}
        canOverride={false}
        overrideReason=""
        overrideVerdict="suspicious"
        onOverrideReasonChange={() => {}}
        onOverrideVerdictChange={() => {}}
        onSaveOverride={async () => {}}
      />
    );
    expect(
      screen.getByText(/Select a review from the queue to inspect analysis results/i)
    ).toBeInTheDocument();
  });

  it("renders verdict and findings when review is loaded", () => {
    render(
      <ReviewDetailPanel
        review={{
          _id: "abc",
          subject: "Phish test",
          senderEmail: "a@b.com",
          status: "completed",
          analysisResult: {
            verdict: "likely_phishing",
            recommendedAction: "report_and_block",
            summary: "Credential harvest attempt",
            findings: [
              {
                severity: "high",
                explanation: "Suspicious link",
                evidence: "http://evil.test",
              },
            ],
            followUpQuestions: [],
          },
        }}
        canOverride={false}
        overrideReason=""
        overrideVerdict="likely_phishing"
        onOverrideReasonChange={() => {}}
        onOverrideVerdictChange={() => {}}
        onSaveOverride={async () => {}}
      />
    );

    expect(screen.getByText(/Phish test/)).toBeInTheDocument();
    expect(screen.getByText(/likely_phishing/i)).toBeInTheDocument();
    expect(screen.getByText(/Suspicious link/)).toBeInTheDocument();
  });

  it("renders AgentTracePanel when review includes agentTrace", () => {
    render(
      <ReviewDetailPanel
        review={{
          _id: "abc",
          subject: "Agent run",
          senderEmail: "a@b.com",
          status: "completed",
          analysisResult: {
            verdict: "suspicious",
            recommendedAction: "investigate",
            summary: "Test",
            findings: [],
            followUpQuestions: [],
          },
          agentTrace: {
            runId: "run-1",
            provider: "mock",
            modelId: "mock",
            statesVisited: ["INTAKE", "PLAN", "PERSIST"],
            toolCalls: [{ name: "run_rule_engine", ok: true, latencyMs: 2 }],
            guardrailEvents: [],
            wallDurationMs: 80,
          },
        }}
        canOverride={false}
        overrideReason=""
        overrideVerdict="suspicious"
        onOverrideReasonChange={() => {}}
        onOverrideVerdictChange={() => {}}
        onSaveOverride={async () => {}}
      />
    );
    expect(screen.getByTestId("agent-trace-panel")).toBeInTheDocument();
  });
});
