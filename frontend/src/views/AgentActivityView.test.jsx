import { render, screen, waitFor } from "@testing-library/react";
import AgentActivityView from "./AgentActivityView";

jest.mock("../api/client", () => ({
  getJson: jest.fn(),
}));

const { getJson } = require("../api/client");

describe("AgentActivityView", () => {
  beforeEach(() => {
    getJson.mockResolvedValue({
      agentEnabled: false,
      cloudProvider: "mock",
      safetyLimits: { maxToolSteps: 3, maxWallMs: 30000, maxBodyChars: 8000 },
      summary: {
        reviewsWithTrace: 2,
        recentSampleSize: 1,
        recentFallbacks: 0,
        avgWallDurationMs: 500,
        toolCallTotals: { run_rule_engine: 1 },
      },
      recentRuns: [
        {
          reviewId: "id1",
          subject: "Urgent login",
          senderEmail: "a@b.com",
          verdict: "likely_phishing",
          statesVisited: ["INTAKE", "PLAN", "PERSIST"],
          toolCalls: [{ name: "run_rule_engine", ok: true }],
          wallDurationMs: 500,
          fallback: false,
        },
      ],
    });
  });

  it("loads agent metrics and renders safety limits plus recent runs table", async () => {
    render(<AgentActivityView />);
    expect(screen.getByTestId("agent-activity-view")).toBeInTheDocument();

    await waitFor(() => {
      expect(getJson).toHaveBeenCalledWith("/metrics/agent-triage");
    });

    expect(screen.getByText(/Agent activity/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Max tool steps/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/Urgent login/i)).toBeInTheDocument();
    expect(screen.getByText(/Agent scoring disabled/i)).toBeInTheDocument();
  });
});
