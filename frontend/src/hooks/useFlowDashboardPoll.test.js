import { act, renderHook, waitFor } from "@testing-library/react";
import { useFlowDashboardPoll } from "./useFlowDashboardPoll";

jest.mock("../api/client", () => ({
  getJson: jest.fn(),
}));

const { getJson } = require("../api/client");

describe("useFlowDashboardPoll", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    getJson.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("fetches on mount and polls on interval", async () => {
    getJson.mockResolvedValue({ generatedAt: "2026-01-01T00:00:00.000Z", queue: { pending: 1 } });

    const { result } = renderHook(() => useFlowDashboardPoll({ enabled: true, intervalMs: 3000 }));

    await waitFor(() => expect(result.current.snapshot).toEqual(expect.objectContaining({ queue: { pending: 1 } })));
    expect(getJson).toHaveBeenCalledWith("/metrics/flow-dashboard");
    expect(getJson).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(3000);
    });

    await waitFor(() => expect(getJson).toHaveBeenCalledTimes(2));
  });

  it("respects minimum 500 ms interval", async () => {
    getJson.mockResolvedValue({ queue: { pending: 0 } });

    renderHook(() => useFlowDashboardPoll({ enabled: true, autoRefresh: true, intervalMs: 100 }));

    await waitFor(() => expect(getJson).toHaveBeenCalledTimes(1));

    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(getJson).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    await waitFor(() => expect(getJson).toHaveBeenCalledTimes(2));
  });

  it("does not poll when autoRefresh is false", async () => {
    getJson.mockResolvedValue({ queue: { pending: 0 } });

    renderHook(() => useFlowDashboardPoll({ enabled: true, autoRefresh: false, intervalMs: 1000 }));

    await waitFor(() => expect(getJson).toHaveBeenCalledTimes(1));

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(getJson).toHaveBeenCalledTimes(1);
  });
});
