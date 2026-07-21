/**
 * Poll hook for GET /metrics/mailbox-ingest — Go ingest-gateway dashboard proxy.
 *
 * Pattern: mirrors useFlowDashboardPoll — interval timer + manual refresh for live charts.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { getJson } from "../api/client";

const DEFAULT_INTERVAL_MS = 3000;

/**
 * @param {{ enabled?: boolean, intervalMs?: number }} [options]
 */
export function useMailboxIngestPoll(options = {}) {
  const enabled = options.enabled !== false;
  const intervalMs = options.intervalMs || DEFAULT_INTERVAL_MS;
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);

  const refresh = useCallback(async (showLoading = true) => {
    if (!enabled) {
      return null;
    }
    if (showLoading) {
      setLoading(true);
    }
    try {
      const data = await getJson("/metrics/mailbox-ingest");
      if (mounted.current) {
        setSnapshot(data);
        setError("");
      }
      return data;
    } catch (err) {
      if (mounted.current) {
        setError(err.message || "Mailbox ingest dashboard unavailable");
      }
      throw err;
    } finally {
      if (mounted.current && showLoading) {
        setLoading(false);
      }
    }
  }, [enabled]);

  useEffect(() => {
    mounted.current = true;
    if (!enabled) {
      return () => {
        mounted.current = false;
      };
    }
    refresh(true).catch(() => {});
    const timer = setInterval(() => {
      refresh(false).catch(() => {});
    }, intervalMs);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [enabled, intervalMs, refresh]);

  return { snapshot, loading, error, refresh };
}
