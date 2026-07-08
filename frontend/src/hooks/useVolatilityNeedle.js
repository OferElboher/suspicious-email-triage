/**
 * Local high-frequency needle jitter for the arrival-volatility gauge.
 *
 * Pattern: API polls every 0.5–30 s, but SOC wall displays feel “alive” when sensitive needles
 * tremble between polls. We anchor on server `volatilityPercent` and add bounded random walk noise.
 * Technology: React useState + setInterval (100 ms tick); cleaned up on unmount.
 *
 * @param {number} basePercent — server-side volatility 0–100 from flow-dashboard snapshot
 * @param {number} [tickMs] — local animation cadence (default 100 ms)
 * @returns {number} display value 0–100 for the needle
 */
import { useEffect, useState } from "react";

/** Hook producing a rapidly changing needle value for FlowVolatilityGauge. */
export function useVolatilityNeedle(basePercent = 0, tickMs = 100) {
  const anchor = Math.min(100, Math.max(0, Number(basePercent) || 0));
  const [display, setDisplay] = useState(anchor);

  /** Re-sync anchor whenever a new API snapshot arrives. */
  useEffect(() => {
    setDisplay(anchor);
  }, [anchor]);

  /** Micro-jitter between polls — amplitude scales with anchor so quiet periods stay calm. */
  useEffect(() => {
    const amplitude = Math.max(8, anchor * 0.35);
    const id = window.setInterval(() => {
      setDisplay((prev) => {
        const drift = (Math.random() - 0.5) * amplitude;
        const pull = (anchor - prev) * 0.15;
        return Math.min(100, Math.max(0, prev + drift + pull));
      });
    }, tickMs);
    return () => window.clearInterval(id);
  }, [anchor, tickMs]);

  return display;
}
