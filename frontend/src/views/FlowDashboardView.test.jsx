import { render, screen } from "@testing-library/react";
import FlowDashboardView from "../views/FlowDashboardView";

jest.mock("../hooks/useFlowDashboardPoll", () => ({
  useFlowDashboardPoll: () => ({
    snapshot: {
      generatedAt: "2026-06-01T12:00:00.000Z",
      clocks: { serverUtc: "2026-06-01T12:00:00.000Z", uptimeSeconds: 3600 },
      queue: { pending: 5, processing: 2, completed: 20, failed: 0, total: 27, backlog: 7 },
      rates: { createdLastMinute: 3, createdPerMinuteAvg5m: 2.4, completedLastMinute: 2 },
      gauges: {
        pendingPercent: 19,
        processingPercent: 7,
        ingestRatePercent: 30,
        backlogPressurePercent: 26,
        ingestGaugeMax: 10,
      },
      pipeline: {
        reviewsCreatedTotal: 100,
        httpRequestsTotal: 500,
        httpErrorsTotal: 0,
        graphSyncFailuresTotal: 0,
        readinessStatus: 1,
      },
      simulation: { available: true, enabled: true, eventsPerMinute: 5 },
      searchIndex: { documentCount: 15 },
    },
    loading: false,
    error: "",
    refresh: jest.fn(),
  }),
}));

describe("FlowDashboardView", () => {
  it("renders gauges, clocks, and simulation pill", () => {
    render(<FlowDashboardView />);
    expect(screen.getByRole("heading", { name: /Live flow dashboard/i })).toBeInTheDocument();
    expect(screen.getByText(/Ingest rate \(last 1 min\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Running · 5\/min/i)).toBeInTheDocument();
    expect(screen.getByText(/Server time \(UTC\)/i)).toBeInTheDocument();
  });
});
