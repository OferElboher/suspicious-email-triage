/**
 * Live flow dashboard auto-refresh preferences (browser localStorage).
 *
 * Pattern: client-side UX settings that do not require server persistence — similar to chart
 * date-range picks stored only for the session. Technology: localStorage JSON blob keyed per app.
 */

/** Minimum poll period in milliseconds (0.5 s — fast enough for SOC demos, avoids API hammering). */
export const FLOW_DASHBOARD_MIN_INTERVAL_MS = 500;

/** Default poll period when the user has not changed settings (3 s). */
export const FLOW_DASHBOARD_DEFAULT_INTERVAL_MS = 3000;

/** localStorage key for refresh interval + enabled flag. */
export const FLOW_DASHBOARD_REFRESH_STORAGE_KEY = "triage_flow_dashboard_refresh";

/** Preset intervals shown in the UI select (seconds). */
export const FLOW_DASHBOARD_INTERVAL_PRESETS_SEC = [0.5, 1, 2, 3, 5, 10, 30];

/**
 * Clamp and validate a poll interval in milliseconds.
 * @param {number} ms
 * @returns {number}
 */
export function normalizeFlowDashboardIntervalMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < FLOW_DASHBOARD_MIN_INTERVAL_MS) {
    return FLOW_DASHBOARD_MIN_INTERVAL_MS;
  }
  return Math.round(n);
}

/**
 * Read persisted auto-refresh settings from localStorage (safe fallback on parse errors).
 * @returns {{ autoRefresh: boolean, intervalMs: number }}
 */
export function readFlowDashboardRefreshPrefs() {
  try {
    const raw = localStorage.getItem(FLOW_DASHBOARD_REFRESH_STORAGE_KEY);
    if (!raw) {
      return { autoRefresh: true, intervalMs: FLOW_DASHBOARD_DEFAULT_INTERVAL_MS };
    }
    const parsed = JSON.parse(raw);
    return {
      autoRefresh: parsed.autoRefresh !== false,
      intervalMs: normalizeFlowDashboardIntervalMs(parsed.intervalMs),
    };
  } catch {
    return { autoRefresh: true, intervalMs: FLOW_DASHBOARD_DEFAULT_INTERVAL_MS };
  }
}

/**
 * Persist auto-refresh settings to localStorage.
 * @param {{ autoRefresh: boolean, intervalMs: number }} prefs
 */
export function writeFlowDashboardRefreshPrefs(prefs) {
  const payload = {
    autoRefresh: Boolean(prefs.autoRefresh),
    intervalMs: normalizeFlowDashboardIntervalMs(prefs.intervalMs),
  };
  localStorage.setItem(FLOW_DASHBOARD_REFRESH_STORAGE_KEY, JSON.stringify(payload));
}
