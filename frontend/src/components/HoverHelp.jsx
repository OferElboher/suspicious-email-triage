/**
 * Accessible hover tooltip for inline help — used instead of long instructional paragraphs in forms.
 * Pattern: mouse enter/leave on a wrapper; popup positioned near cursor (same idea as graph-tooltip).
 */
import { useCallback, useId, useState } from "react";

/**
 * @param {object} props
 * @param {string} props.text — help text shown on hover/focus
 * @param {import('react').ReactNode} props.children — control or label to wrap
 * @param {string} [props.className] — optional wrapper class
 */
export default function HoverHelp({ text, children, className = "" }) {
  const [tip, setTip] = useState(null);
  const tipId = useId();

  const show = useCallback((event) => {
    setTip({ x: event.clientX, y: event.clientY });
  }, []);

  const hide = useCallback(() => setTip(null), []);

  return (
    <span
      className={`hover-help ${className}`.trim()}
      onMouseEnter={show}
      onMouseMove={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      aria-describedby={tip ? tipId : undefined}
    >
      {children}
      {tip && (
        <span
          id={tipId}
          className="hover-help__popup"
          role="tooltip"
          style={{ left: tip.x + 12, top: tip.y + 12 }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
