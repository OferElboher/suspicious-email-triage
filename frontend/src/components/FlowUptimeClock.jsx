/**
 * Uptime display — circular progress ring + elapsed HH:MM:SS (API process lifetime).
 *
 * Pattern: complements analog server clock; shows how long the Node API has been running.
 * Technology: SVG stroke-dashoffset animation tied to uptime vs 24h reference scale.
 *
 * @param {object} props
 * @param {number} props.uptimeSeconds — from flow-dashboard clocks.uptimeSeconds
 * @param {string} [props.label]
 */
export default function FlowUptimeClock({ uptimeSeconds = 0, label = "API uptime" }) {
  const sec = Math.max(0, Number(uptimeSeconds) || 0);
  const hours = Math.floor(sec / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  const display = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

  /** Ring fills over a 24h reference (caps at 100% for longer uptimes). */
  const dayFraction = Math.min(1, sec / (24 * 3600));
  const circumference = 2 * Math.PI * 42;
  const offset = circumference * (1 - dayFraction);

  return (
    <div className="flow-uptime" role="timer" aria-label={`${label} ${display}`}>
      <svg className="flow-uptime__svg" viewBox="0 0 100 100" aria-hidden="true">
        <circle className="flow-uptime__track" cx="50" cy="50" r="42" fill="none" />
        <circle
          className="flow-uptime__progress"
          cx="50"
          cy="50"
          r="42"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="flow-uptime__value">{display}</div>
      <div className="flow-uptime__label">{label}</div>
    </div>
  );
}
