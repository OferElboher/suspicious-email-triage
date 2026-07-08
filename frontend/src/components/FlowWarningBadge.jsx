/**
 * Theme-safe warning badge for range gauges — SVG triangle (not Unicode ⚠).
 *
 * Pattern: SOC “armed indicator” uses fixed high-contrast fills so the badge stays visible on
 * every Appearance theme (`data-theme` on `<html>`). Idle = gray triangle; active = amber/red.
 * Technology: inline SVG paths with dedicated CSS classes (not `currentColor` / `--muted` alone).
 *
 * @param {object} props
 * @param {string} props.className — idle or active+tone modifier classes from parent
 * @param {string} props.title — tooltip text
 * @param {boolean} [props.ariaHidden]
 */
export default function FlowWarningBadge({ className, title, ariaHidden = false }) {
  return (
    <span
      className={className}
      data-testid="flow-range-warning"
      title={title}
      role="img"
      aria-hidden={ariaHidden}
      aria-label={ariaHidden ? undefined : title}
    >
      <svg
        className="flow-warning-badge__svg"
        viewBox="0 0 20 20"
        aria-hidden="true"
        data-testid="flow-warning-badge-svg"
      >
        <path className="flow-warning-badge__triangle" d="M10 2.5 L17.5 16.5 H2.5 Z" />
        <text className="flow-warning-badge__mark" x="10" y="14" textAnchor="middle">
          !
        </text>
      </svg>
    </span>
  );
}
