import { render, screen } from "@testing-library/react";
import FlowDashboardView from "../views/FlowDashboardView";

jest.mock("../hooks/useFlowDashboardPoll", () => ({
  useFlowDashboardPoll: () => ({
    snapshot: {
      generatedAt: "2026-06-01T12:00:00.000Z",
      clocks: { serverUtc: "2026-06-01T12:00:00.000Z", uptimeSeconds: 3600 },
      queue: { pending: 5, processing: 2, completed: 20, failed: 0, total: 27, backlog: 7 },
      rates: { createdLastMinute: 28, createdPerMinuteAvg5m: 24, completedLastMinute: 22 },
      gauges: {
        pendingPercent: 19,
        processingPercent: 7,
        ingestRatePercent: 93,
        backlogPressurePercent: 26,
        ingestGaugeMax: 30,
        pendingActivityPercent: 83,
        pendingScaleMax: 6,
        processingActivityPercent: 67,
        processingScaleMax: 3,
        completionThroughputPercent: 73,
        completionScaleMax: 30,
      },
      pipeline: {
        reviewsCreatedTotal: 100,
        httpRequestsTotal: 500,
        httpErrorsTotal: 0,
        graphSyncFailuresTotal: 0,
        readinessStatus: 1,
      },
      simulation: { available: true, enabled: true, eventsPerMinute: 30 },
      searchIndex: { documentCount: 15 },
    },
    loading: false,
    error: "",
    refresh: jest.fn(),
  }),
}));

describe("FlowDashboardView", () => {
  it("renders activity gauges with primary counts and simulation pill", () => {
    render(<FlowDashboardView />);
    expect(screen.getByRole("heading", { name: /Live flow dashboard/i })).toBeInTheDocument();
    expect(screen.getByText(/Ingest rate \(last 1 min\)/i)).toBeInTheDocument();
    expect(screen.getByText("28/min")).toBeInTheDocument();
    expect(screen.getByText(/Running · 30\/min/i)).toBeInTheDocument();
    expect(screen.getByText(/Server time \(UTC\)/i)).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();
  });
});
