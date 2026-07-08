/**
 * Vertical tank gauge — fill rises from bottom (classic SOC “fuel tank” / queue level display).
 *
 * Pattern: complementary to semicircle FlowGauge; same 0–100 semantics but vertical orientation.
 * Technology: SVG `<rect>` clip + animated height via `y`/`height`; optional zone tint on fill.
 *
 * @param {object} props
 * @param {number} props.value — fill level 0–100
 * @param {string} props.label
 * @param {string} [props.primaryDisplay]
 * @param {string} [props.detail]
 * @param {string} [props.tone] — default | ok | warn | danger (fill color modifier)
 */
export default function FlowVerticalGauge({
  value = 0,
  label,
  primaryDisplay,
  detail = "",
  tone = "default",
}) {
  const clamped = Math.min(100, Math.max(0, Number(value) || 0));
  const fillHeight = (clamped / 100) * 80;
  const fillY = 92 - fillHeight;
  const headline = primaryDisplay != null && primaryDisplay !== "" ? primaryDisplay : `${clamped}%`;

  return (
    <div
      className={`flow-vertical-gauge flow-vertical-gauge--${tone}`}
      role="meter"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${label}: ${headline}`}
    >
      <svg className="flow-vertical-gauge__svg" viewBox="0 0 56 100" aria-hidden="true">
        <rect className="flow-vertical-gauge__track" x="16" y="12" width="24" height="80" rx="4" />
        <rect
          className="flow-vertical-gauge__fill"
          x="16"
          y={fillY}
          width="24"
          height={Math.max(fillHeight, clamped > 0 ? 2 : 0)}
          rx="4"
        />
        {[25, 50, 75].map((tick) => (
          <line
            key={tick}
            className="flow-vertical-gauge__tick"
            x1="12"
            y1={92 - (tick / 100) * 80}
            x2="44"
            y2={92 - (tick / 100) * 80}
          />
        ))}
      </svg>
      <div className="flow-vertical-gauge__value">{headline}</div>
      <div className="flow-vertical-gauge__label">{label}</div>
      {detail && <div className="flow-vertical-gauge__detail muted">{detail}</div>}
    </div>
  );
}
