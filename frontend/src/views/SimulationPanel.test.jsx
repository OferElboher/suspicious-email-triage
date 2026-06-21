/**
 * Tests for dev simulation panel — Start/Stop toggle and rate apply (mocked API).
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SimulationPanel from "./SimulationPanel";
import { getJson, postJson } from "../api/client";

jest.mock("../api/client", () => ({
  getJson: jest.fn(),
  postJson: jest.fn(),
}));

describe("SimulationPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getJson.mockResolvedValue({
      simulation: { enabled: false, eventsPerMinute: 2 },
    });
    postJson.mockResolvedValue({ ok: true });
  });

  it("shows stopped status and Start simulation when disabled", async () => {
    render(<SimulationPanel maxPerMin={30} />);
    expect(await screen.findByText(/Status: stopped/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start simulation/i })).toBeInTheDocument();
  });

  it("Start simulation posts enabled true with current rate", async () => {
    render(<SimulationPanel maxPerMin={30} />);
    fireEvent.click(await screen.findByRole("button", { name: /Start simulation/i }));
    await waitFor(() => {
      expect(postJson).toHaveBeenCalledWith("/dev/simulation", {
        enabled: true,
        eventsPerMinute: 2,
      });
    });
    expect(await screen.findByText(/Status: running/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Stop simulation/i })).toBeInTheDocument();
  });

  it("Stop simulation posts enabled false without requiring rate change", async () => {
    getJson.mockResolvedValue({
      simulation: { enabled: true, eventsPerMinute: 5 },
    });
    render(<SimulationPanel maxPerMin={30} />);
    fireEvent.click(await screen.findByRole("button", { name: /Stop simulation/i }));
    await waitFor(() => {
      expect(postJson).toHaveBeenCalledWith("/dev/simulation", {
        enabled: false,
        eventsPerMinute: 5,
      });
    });
    expect(await screen.findByText(/Status: stopped/i)).toBeInTheDocument();
  });

  it("Apply rate is enabled only when running and rate changed", async () => {
    getJson.mockResolvedValue({
      simulation: { enabled: true, eventsPerMinute: 2 },
    });
    render(<SimulationPanel maxPerMin={30} />);
    const applyBtn = await screen.findByRole("button", { name: /Apply rate/i });
    expect(applyBtn).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Emails per minute/i), { target: { value: "4" } });
    expect(applyBtn).not.toBeDisabled();
    fireEvent.click(applyBtn);
    await waitFor(() => {
      expect(postJson).toHaveBeenCalledWith("/dev/simulation", {
        enabled: true,
        eventsPerMinute: 4,
      });
    });
  });
});
