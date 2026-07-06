/**
 * Semicircle gauge — SVG needle rotated by CSS transition (live dashboard pattern).
 *
 * Pattern: presentational component; value 0–100 maps to needle angle -90°..+90°.
 * Technology: plain SVG + CSS transform (no chart library — keeps bundle small).
 *
 * @param {object} props
 * @param {number} props.value — needle position 0–100
 * @param {string} props.label — heading under the gauge
 * @param {string} [props.detail] — secondary caption (counts, units)
 * @param {string} [props.tone] — CSS modifier: default | warn | ok | danger
 */
export default function FlowGauge({ value = 0, label, detail = "", tone = "default" }) {
  const clamped = Math.min(100, Math.max(0, Number(value) || 0));
  /** Needle rotation: 0% = -90deg (left), 100% = +90deg (right). */
  const rotation = -90 + (clamped / 100) * 180;

  return (
    <div className={`flow-gauge flow-gauge--${tone}`} role="meter" aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
      <svg className="flow-gauge__svg" viewBox="0 0 120 70" aria-hidden="true">
        <path
          className="flow-gauge__arc flow-gauge__arc--bg"
          d="M 12 62 A 48 48 0 0 1 108 62"
          fill="none"
        />
        <path
          className="flow-gauge__arc flow-gauge__arc--fill"
          d="M 12 62 A 48 48 0 0 1 108 62"
          fill="none"
          pathLength="100"
          strokeDasharray={`${clamped} 100`}
        />
        <g
          className="flow-gauge__needle"
          style={{ transform: `rotate(${rotation}deg)`, transformOrigin: "60px 62px" }}
        >
          <line x1="60" y1="62" x2="60" y2="22" />
          <circle cx="60" cy="62" r="4" className="flow-gauge__hub" />
        </g>
      </svg>
      <div className="flow-gauge__value">{clamped}%</div>
      <div className="flow-gauge__label">{label}</div>
      {detail && <div className="flow-gauge__detail muted">{detail}</div>}
    </div>
  );
}
