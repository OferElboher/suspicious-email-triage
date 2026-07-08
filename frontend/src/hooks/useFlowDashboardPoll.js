/**
 * Poll GET /metrics/flow-dashboard on a configurable interval while the Live flow tab is mounted.
 *
 * Pattern: same idea as AnalyticsView auto-refresh but user-tunable (0.5 s–30 s via localStorage).
 * Technology: React useEffect + setInterval; cleans up on unmount; background polls skip loading UI.
 *
 * @param {object} options
 * @param {boolean} options.enabled — fetch when tab visible
 * @param {boolean} [options.autoRefresh] — when false, only manual refresh runs
 * @param {number} [options.intervalMs] — poll period (default 3000, minimum 500)
 * @returns {{ snapshot: object|null, loading: boolean, error: string, refresh: Function }}
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getJson } from "../api/client";
import {
  FLOW_DASHBOARD_DEFAULT_INTERVAL_MS,
  normalizeFlowDashboardIntervalMs,
} from "../lib/flowDashboardRefresh";

/** Hook wrapping flow-dashboard polling for FlowDashboardView. */
export function useFlowDashboardPoll({
  enabled,
  autoRefresh = true,
  intervalMs = FLOW_DASHBOARD_DEFAULT_INTERVAL_MS,
} = {}) {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const snapshotRef = useRef(null);
  const safeIntervalMs = normalizeFlowDashboardIntervalMs(intervalMs);

  snapshotRef.current = snapshot;

  /**
   * Fetch snapshot; show loading spinner only on first load or explicit manual refresh.
   * @param {{ manual?: boolean }} [opts]
   */
  const refresh = useCallback(
    async (opts = {}) => {
      if (!enabled) {
        return;
      }
      const manual = Boolean(opts.manual);
      const showLoading = manual || snapshotRef.current == null;
      if (showLoading) {
        setLoading(true);
      }
      try {
        const data = await getJson("/metrics/flow-dashboard");
        setSnapshot(data);
        setError("");
      } catch (err) {
        setError(err.message || "Flow dashboard unavailable");
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [enabled]
  );

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    refresh().catch(() => {});
    if (!autoRefresh) {
      return undefined;
    }
    const id = window.setInterval(() => {
      refresh().catch(() => {});
    }, safeIntervalMs);
    return () => window.clearInterval(id);
  }, [enabled, autoRefresh, safeIntervalMs, refresh]);

  /** Manual refresh wrapper — always shows loading feedback. */
  const refreshManual = useCallback(() => refresh({ manual: true }), [refresh]);

  return { snapshot, loading, error, refresh: refreshManual };
}
