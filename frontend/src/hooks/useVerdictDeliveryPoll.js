/**
 * Poll GET /metrics/verdict-delivery for outbound webhook stats and mock receiver log.
 *
 * Pattern: same interval hook style as useMailboxIngestPoll — JWT via setupProxy.
 */
import { useCallback, useEffect, useState } from "react";
import { getJson } from "../api/client";

/**
 * @param {{ enabled?: boolean, intervalMs?: number }} options
 */
export function useVerdictDeliveryPoll({ enabled = true, intervalMs = 5000 } = {}) {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!enabled) {
      return null;
    }
    setLoading(true);
    setError("");
    try {
      const data = await getJson("/metrics/verdict-delivery");
      setSnapshot(data);
      return data;
    } catch (err) {
      setError(err.message || "Failed to load verdict delivery metrics");
      return null;
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    refresh().catch(() => {});
    const id = setInterval(() => {
      refresh().catch(() => {});
    }, intervalMs);
    return () => clearInterval(id);
  }, [enabled, intervalMs, refresh]);

  return { snapshot, loading, error, refresh };
}
