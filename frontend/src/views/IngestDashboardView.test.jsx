import { render, screen, waitFor } from "@testing-library/react";
import IngestDashboardView from "./IngestDashboardView";

jest.mock("../api/client", () => ({
  getJson: jest.fn(),
  postJson: jest.fn(),
}));

const { getJson } = require("../api/client");

describe("IngestDashboardView", () => {
  beforeEach(() => {
    getJson.mockResolvedValue({
      enabled: true,
      totals: { received: 10, webhook: 4, simulation: 6, errors: 1 },
      rates: { lastMinuteReceived: 2, simulationEnabled: false },
      series: { perMinute: [] },
      uptimeSeconds: 120,
    });
  });

  it("renders mailbox ingest stats after load", async () => {
    render(<IngestDashboardView canSimulate={false} maxEventsPerMin={30} />);
    await waitFor(() => {
      expect(screen.getByTestId("ingest-dashboard-view")).toBeInTheDocument();
    });
    expect(screen.getByText("Mailbox ingest gateway")).toBeInTheDocument();
    expect(screen.getByText("Total received")).toBeInTheDocument();
  });
});
