/**
 * IngestDashboardView tests — verifies the #ingest tab renders gateway stat cards
 * and Go dev simulation toggle (Start simulation / Stop simulation).
 * Mocks GET /metrics/mailbox-ingest so no Go container is required in Jest.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import IngestDashboardView from "./IngestDashboardView";

jest.mock("../api/client", () => ({
  getJson: jest.fn(),
  postJson: jest.fn(),
}));

const { getJson, postJson } = require("../api/client");

describe("IngestDashboardView", () => {
  beforeEach(() => {
    getJson.mockResolvedValue({
      enabled: true,
      totals: { received: 10, webhook: 4, simulation: 6, errors: 1 },
      rates: { lastMinuteReceived: 2, simulationEnabled: false },
      series: { perMinute: [] },
      uptimeSeconds: 120,
    });
    postJson.mockResolvedValue({ emailsPerMinute: 5 });
  });

  it("renders mailbox ingest stats after load", async () => {
    render(<IngestDashboardView canSimulate={false} maxEventsPerMin={30} />);
    await waitFor(() => {
      expect(screen.getByTestId("ingest-dashboard-view")).toBeInTheDocument();
    });
    expect(screen.getByText("Mailbox ingest gateway")).toBeInTheDocument();
    expect(screen.getByText("Total received")).toBeInTheDocument();
  });

  it("shows Start simulation toggle when simulation is stopped", async () => {
    render(<IngestDashboardView canSimulate={true} maxEventsPerMin={30} />);
    const startBtn = await screen.findByRole("button", { name: /Start simulation/i });
    expect(startBtn).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Stop simulation/i })).not.toBeInTheDocument();
  });

  it("shows Stop simulation toggle when simulation is running", async () => {
    getJson.mockResolvedValue({
      enabled: true,
      totals: { received: 10, webhook: 4, simulation: 6, errors: 1 },
      rates: { lastMinuteReceived: 2, simulationEnabled: true, simulationEmailsPerMinute: 5 },
      series: { perMinute: [] },
      uptimeSeconds: 120,
    });
    render(<IngestDashboardView canSimulate={true} maxEventsPerMin={30} />);
    const stopBtn = await screen.findByRole("button", { name: /Stop simulation/i });
    expect(stopBtn).toBeEnabled();
    expect(screen.getByLabelText(/Emails\/min/i)).toBeDisabled();
  });

  it("Start simulation posts start action with current rate", async () => {
    render(<IngestDashboardView canSimulate={true} maxEventsPerMin={30} />);
    fireEvent.click(await screen.findByRole("button", { name: /Start simulation/i }));
    await waitFor(() => {
      expect(postJson).toHaveBeenCalledWith("/metrics/mailbox-ingest/simulation", {
        action: "start",
        emailsPerMinute: 5,
      });
    });
  });
});
