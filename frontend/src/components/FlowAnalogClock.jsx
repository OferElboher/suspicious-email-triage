/**
 * Analog clock face — hour/minute/second hands with smooth CSS transitions.
 *
 * Pattern: local tick (requestAnimationFrame or 1s interval) between API polls so hands move
 * continuously; optional serverUtc from GET /metrics/flow-dashboard reduces clock skew.
 * Technology: SVG hands + CSS transform rotate (standard dashboard clock trick).
 *
 * @param {object} props
 * @param {string} [props.serverUtc] — ISO timestamp from backend (sync on each poll)
 * @param {string} [props.label] — caption under the clock
 */
import { useEffect, useState } from "react";

/** Build Date from server ISO or local now. */
function resolveClockDate(serverUtc) {
  if (serverUtc) {
    const parsed = new Date(serverUtc);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date();
}

/** Compute hand angles for an analog clock (12 o'clock = 0° rotation baseline). */
function handAngles(date) {
  const seconds = date.getSeconds() + date.getMilliseconds() / 1000;
  const minutes = date.getMinutes() + seconds / 60;
  const hours = (date.getHours() % 12) + minutes / 60;
  return {
    second: seconds * 6,
    minute: minutes * 6,
    hour: hours * 30,
  };
}

/** SVG analog clock with moving hands (UTC by default). */
export default function FlowAnalogClock({ serverUtc, label = "Server time (UTC)" }) {
  const [now, setNow] = useState(() => resolveClockDate(serverUtc));
  const [anchorMs, setAnchorMs] = useState(() => Date.now());

  /** Re-sync to server time whenever a new poll payload arrives. */
  useEffect(() => {
    setNow(resolveClockDate(serverUtc));
    setAnchorMs(Date.now());
  }, [serverUtc]);

  /** Advance hands every second between polls for a “live” SOC dashboard feel. */
  useEffect(() => {
    const id = window.setInterval(() => {
      const base = resolveClockDate(serverUtc);
      const elapsed = Date.now() - anchorMs;
      setNow(new Date(base.getTime() + elapsed));
    }, 1000);
    return () => window.clearInterval(id);
  }, [serverUtc, anchorMs]);

  const { second, minute, hour } = handAngles(now);
  const timeLabel = now.toISOString().slice(11, 19);

  return (
    <div className="flow-clock" aria-label={`${label} ${timeLabel} UTC`}>
      <svg className="flow-clock__svg" viewBox="0 0 100 100" aria-hidden="true">
        <circle className="flow-clock__face" cx="50" cy="50" r="46" />
        {[...Array(12)].map((_, i) => {
          const angle = (i / 12) * 360 - 90;
          const rad = (angle * Math.PI) / 180;
          const x1 = 50 + Math.cos(rad) * 38;
          const y1 = 50 + Math.sin(rad) * 38;
          const x2 = 50 + Math.cos(rad) * 44;
          const y2 = 50 + Math.sin(rad) * 44;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="flow-clock__tick" />;
        })}
        <g style={{ transform: `rotate(${hour}deg)`, transformOrigin: "50px 50px" }}>
          <line x1="50" y1="50" x2="50" y2="28" className="flow-clock__hand flow-clock__hand--hour" />
        </g>
        <g style={{ transform: `rotate(${minute}deg)`, transformOrigin: "50px 50px" }}>
          <line x1="50" y1="50" x2="50" y2="22" className="flow-clock__hand flow-clock__hand--minute" />
        </g>
        <g style={{ transform: `rotate(${second}deg)`, transformOrigin: "50px 50px" }}>
          <line x1="50" y1="50" x2="50" y2="18" className="flow-clock__hand flow-clock__hand--second" />
        </g>
        <circle cx="50" cy="50" r="2.5" className="flow-clock__hub" />
      </svg>
      <div className="flow-clock__digital">{timeLabel} UTC</div>
      <div className="flow-clock__label">{label}</div>
    </div>
  );
}
