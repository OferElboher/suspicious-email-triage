/**
 * Semicircle gauge — SVG arc + needle for the live flow dashboard (#flow tab).
 *
 * Pattern: presentational “dumb” component; parent passes 0–100 for the needle and an optional
 * human-readable primary line (e.g. `28/min`) so analysts see real counts, not only percentages.
 * Technology: plain SVG with the native `transform="rotate(angle cx cy)"` attribute on `<g>` —
 * more reliable than CSS `transform` on SVG groups when the SVG is scaled via `viewBox`.
 *
 * @param {object} props
 * @param {number} props.value — needle position 0–100 (clamped)
 * @param {string} props.label — heading under the gauge
 * @param {string} [props.primaryDisplay] — large caption (counts, units); defaults to percent
 * @param {string} [props.detail] — secondary muted caption
 * @param {string} [props.tone] — CSS modifier: default | warn | ok | danger
 */
export default function FlowGauge({
  value = 0,
  label,
  primaryDisplay,
  detail = "",
  tone = "default",
}) {
  const clamped = Math.min(100, Math.max(0, Number(value) || 0));
  /** Needle rotation: 0% = -90° (left), 100% = +90° (right); pivot at arc center (60, 62). */
  const rotation = -90 + (clamped / 100) * 180;
  /** When value > 0 but rounds to 0% arc, draw a sliver so the gauge never looks “dead”. */
  const arcFill = clamped > 0 && clamped < 2 ? 2 : clamped;
  const headline = primaryDisplay != null && primaryDisplay !== "" ? primaryDisplay : `${clamped}%`;

  return (
    <div
      className={`flow-gauge flow-gauge--${tone}`}
      role="meter"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${label}: ${headline}`}
    >
      <svg className="flow-gauge__svg" viewBox="0 0 120 70" aria-hidden="true">
        <path
          className="flow-gauge__arc flow-gauge__arc--bg"
          d="M 12 62 A 48 48 0 0 1 108 62"
          fill="none"
          strokeWidth={8}
        />
        <path
          className="flow-gauge__arc flow-gauge__arc--fill"
          d="M 12 62 A 48 48 0 0 1 108 62"
          fill="none"
          strokeWidth={8}
          pathLength="100"
          strokeDasharray={`${arcFill} 100`}
        />
        <g className="flow-gauge__needle" transform={`rotate(${rotation} 60 62)`}>
          <line x1="60" y1="62" x2="60" y2="22" strokeWidth={2} />
          <circle cx="60" cy="62" r="4" className="flow-gauge__hub" />
        </g>
      </svg>
      <div className="flow-gauge__value">{headline}</div>
      {primaryDisplay != null && primaryDisplay !== "" && (
        <div className="flow-gauge__percent muted">{clamped}% of scale</div>
      )}
      <div className="flow-gauge__label">{label}</div>
      {detail && <div className="flow-gauge__detail muted">{detail}</div>}
    </div>
  );
}
