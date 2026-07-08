import { act, renderHook } from "@testing-library/react";
import { useVolatilityNeedle } from "./useVolatilityNeedle";

describe("useVolatilityNeedle", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("starts at anchor and moves after tick", () => {
    const { result } = renderHook(() => useVolatilityNeedle(50, 100));
    expect(result.current).toBe(50);

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(result.current).not.toBe(50);
    expect(result.current).toBeGreaterThanOrEqual(0);
    expect(result.current).toBeLessThanOrEqual(100);
  });
});
