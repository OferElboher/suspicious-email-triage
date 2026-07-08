/**
 * Semicircle gauge with colored threshold bands (green / amber / red SOC zones).
 *
 * Pattern: traffic-light ranges — needle position shows current value; arc segments show limits;
 * FlowWarningBadge sits in a top rail (not over the SVG) so it is never clipped and stays visible
 * on all Appearance themes. Idle gray → amber/red when thresholds breach.
 * Technology: stacked SVG arc paths with pathLength=100; FlowWarningBadge SVG indicator.
 *
 * @typedef {{ from: number, to: number, tone: string, label: string }} FlowRangeZone
 *
 * @param {object} props
 * @param {number} props.value — needle 0–100
 * @param {string} props.label
 * @param {FlowRangeZone[]} props.zones — ordered non-overlapping bands covering 0–100
 * @param {string} [props.primaryDisplay]
 * @param {string} [props.detail]
 */
import FlowWarningBadge from "./FlowWarningBadge";

export default function FlowRangeGauge({
  value = 0,
  label,
  zones = [],
  primaryDisplay,
  detail = "",
}) {
  const clamped = Math.min(100, Math.max(0, Number(value) || 0));
  const rotation = -90 + (clamped / 100) * 180;
  const headline = primaryDisplay != null && primaryDisplay !== "" ? primaryDisplay : `${clamped}%`;

  /** Active zone drives colored warning + ARIA status text. */
  const activeZone =
    zones.find((z) => clamped >= z.from && clamped < z.to) || zones[zones.length - 1] || null;
  const warningActive =
    activeZone && (activeZone.tone === "warn" || activeZone.tone === "danger");

  const arcPath = "M 12 62 A 48 48 0 0 1 108 62";

  /** Compose warning class: idle gray by default; active + tone when threshold breached. */
  const warningClass = warningActive
    ? `flow-range-gauge__warning flow-range-gauge__warning--active flow-range-gauge__warning--${activeZone.tone}`
    : "flow-range-gauge__warning flow-range-gauge__warning--idle";

  const warningTitle = warningActive ? activeZone.label : "Threshold indicator (idle)";

  return (
    <div
      className={`flow-range-gauge flow-range-gauge--${activeZone?.tone || "default"}`}
      role="meter"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${label}: ${headline}${activeZone ? `, ${activeZone.label}` : ""}`}
    >
      <div className="flow-range-gauge__warning-rail" data-testid="flow-range-warning-rail">
        <FlowWarningBadge
          className={warningClass}
          title={warningTitle}
          ariaHidden={!warningActive}
        />
      </div>
      <svg className="flow-range-gauge__svg" viewBox="0 0 120 70" aria-hidden="true">
        {zones.map((zone) => {
          const len = Math.max(0, zone.to - zone.from);
          return (
            <path
              key={`${zone.from}-${zone.to}-${zone.tone}`}
              className={`flow-range-gauge__zone flow-range-gauge__zone--${zone.tone}`}
              d={arcPath}
              fill="none"
              strokeWidth={8}
              pathLength="100"
              strokeDasharray={`${len} 100`}
              strokeDashoffset={String(-zone.from)}
            />
          );
        })}
        <g className="flow-range-gauge__needle" transform={`rotate(${rotation} 60 62)`}>
          <line x1="60" y1="62" x2="60" y2="22" strokeWidth={2} />
          <circle cx="60" cy="62" r="4" className="flow-range-gauge__hub" />
        </g>
      </svg>
      <div className="flow-range-gauge__value">{headline}</div>
      {activeZone && (
        <div
          className={`flow-range-gauge__zone-label flow-range-gauge__zone-label--${
            warningActive || activeZone.tone === "ok" ? activeZone.tone : "idle"
          }`}
        >
          {activeZone.label}
        </div>
      )}
      <div className="flow-range-gauge__label">{label}</div>
      {detail && <div className="flow-range-gauge__detail muted">{detail}</div>}
    </div>
  );
}
