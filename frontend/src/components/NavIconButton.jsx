/**
 * Uniform round navigation control — large icon visible, full tab name on HoverHelp above button.
 *
 * Pattern: aria-label for screen readers; HoverHelp placement="above" + viewport clamp.
 */
import HoverHelp from "./HoverHelp";

/**
 * @param {object} props
 * @param {string} props.label — full tab name shown in hover tooltip
 * @param {boolean} props.active — current route
 * @param {() => void} props.onClick — switch app sub-window
 * @param {React.ReactNode} props.children — SVG icon
 */
export default function NavIconButton({ label, active, onClick, children }) {
  return (
    <HoverHelp text={label} placement="above">
      <button
        type="button"
        className={`nav-icon${active ? " nav-icon--active" : ""}`}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        onClick={onClick}
      >
        {children}
      </button>
    </HoverHelp>
  );
}
