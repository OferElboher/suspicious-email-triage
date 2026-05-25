import { renderHook, act } from "@testing-library/react";
import { useAppScreen } from "./useAppScreen";

describe("useAppScreen", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/");
  });

  test("syncs tab changes to the URL hash", () => {
    const canAccess = () => true;
    const { result } = renderHook(() => useAppScreen(canAccess));

    act(() => {
      result.current[1]("analytics");
    });

    expect(result.current[0]).toBe("analytics");
    expect(window.location.hash).toBe("#analytics");
  });

  test("reads initial screen from hash on mount", () => {
    window.location.hash = "#admin";
    const canAccess = () => true;
    const { result } = renderHook(() => useAppScreen(canAccess));
    expect(result.current[0]).toBe("admin");
  });
});
