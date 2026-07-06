/**
 * Poll GET /metrics/flow-dashboard on an interval while the Live flow tab is mounted.
 *
 * Pattern: same idea as AnalyticsView auto-refresh but faster (3s) for gauge animation.
 * Technology: React useEffect + setInterval; cleans up on unmount.
 *
 * @param {object} options
 * @param {boolean} options.enabled — fetch when tab visible
 * @param {number} [options.intervalMs] — poll period (default 3000)
 * @returns {{ snapshot: object|null, loading: boolean, error: string, refresh: Function }}
 */
import { useCallback, useEffect, useState } from "react";
import { getJson } from "../api/client";

const DEFAULT_INTERVAL_MS = 3000;

/** Hook wrapping flow-dashboard polling for FlowDashboardView. */
export function useFlowDashboardPoll({ enabled, intervalMs = DEFAULT_INTERVAL_MS } = {}) {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!enabled) {
      return;
    }
    setLoading(true);
    try {
      const data = await getJson("/metrics/flow-dashboard");
      setSnapshot(data);
      setError("");
    } catch (err) {
      setError(err.message || "Flow dashboard unavailable");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    refresh().catch(() => {});
    const id = window.setInterval(() => {
      refresh().catch(() => {});
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, intervalMs, refresh]);

  return { snapshot, loading, error, refresh };
}
