import {
  FLOW_DASHBOARD_MIN_INTERVAL_MS,
  normalizeFlowDashboardIntervalMs,
  readFlowDashboardRefreshPrefs,
  writeFlowDashboardRefreshPrefs,
  FLOW_DASHBOARD_REFRESH_STORAGE_KEY,
} from "./flowDashboardRefresh";

describe("flowDashboardRefresh", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("normalizeFlowDashboardIntervalMs enforces 500 ms floor", () => {
    expect(normalizeFlowDashboardIntervalMs(100)).toBe(FLOW_DASHBOARD_MIN_INTERVAL_MS);
    expect(normalizeFlowDashboardIntervalMs(2000)).toBe(2000);
  });

  it("readFlowDashboardRefreshPrefs defaults when storage empty", () => {
    const prefs = readFlowDashboardRefreshPrefs();
    expect(prefs.autoRefresh).toBe(true);
    expect(prefs.intervalMs).toBeGreaterThanOrEqual(FLOW_DASHBOARD_MIN_INTERVAL_MS);
  });

  it("writeFlowDashboardRefreshPrefs persists and read round-trips", () => {
    writeFlowDashboardRefreshPrefs({ autoRefresh: false, intervalMs: 500 });
    expect(JSON.parse(localStorage.getItem(FLOW_DASHBOARD_REFRESH_STORAGE_KEY))).toEqual({
      autoRefresh: false,
      intervalMs: 500,
    });
    expect(readFlowDashboardRefreshPrefs().autoRefresh).toBe(false);
  });
});
