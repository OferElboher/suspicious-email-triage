/**
 * High-frequency “jitter” gauge — arrival burstiness with furious local needle motion.
 *
 * Pattern: server supplies std dev of inter-arrival gaps; hook adds 100 ms jitter so the dial
 * feels sensitive like a real SOC wall during traffic bursts (demo + education widget).
 * Technology: FlowGauge semicircle + useVolatilityNeedle hook; tone follows live display value.
 *
 * @param {object} props
 * @param {number} props.basePercent — volatility from GET /metrics/flow-dashboard
 * @param {string} props.label
 * @param {string} [props.primaryDisplay] — e.g. "842 ms σ"
 * @param {string} [props.detail]
 */
import FlowGauge from "./FlowGauge";
import { useVolatilityNeedle } from "../hooks/useVolatilityNeedle";

/** Pick warn/danger tone from animated needle position. */
function toneFromValue(v) {
  if (v >= 70) {
    return "danger";
  }
  if (v >= 40) {
    return "warn";
  }
  return "ok";
}

/** Semicircle gauge whose needle updates ~10× per second between API polls. */
export default function FlowVolatilityGauge({ basePercent = 0, label, primaryDisplay, detail = "" }) {
  const display = useVolatilityNeedle(basePercent, 100);

  return (
    <div className="flow-volatility-gauge">
      <FlowGauge
        value={display}
        label={label}
        primaryDisplay={primaryDisplay}
        detail={detail}
        tone={toneFromValue(display)}
      />
      <div className="flow-volatility-gauge__badge muted" aria-hidden="true">
        Live jitter · 100 ms
      </div>
    </div>
  );
}
