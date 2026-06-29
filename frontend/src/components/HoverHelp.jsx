/**
 * Accessible hover tooltip — cursor-following or anchored above the control (nav bar).
 *
 * Pattern: fixed positioning + useLayoutEffect viewport clamp so labels never clip off-screen.
 * Technology: React refs + getBoundingClientRect; role="tooltip" for screen readers.
 */
import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";

const VIEWPORT_MARGIN = 8;
const POPUP_MAX_WIDTH = 320;

/**
 * @param {object} props
 * @param {string} props.text — help text shown on hover/focus
 * @param {import('react').ReactNode} props.children — control or label to wrap
 * @param {string} [props.className] — optional wrapper class
 * @param {"cursor"|"above"} [props.placement] — cursor follow vs centered above anchor (nav icons)
 */
export default function HoverHelp({
  text,
  children,
  className = "",
  placement = "cursor",
}) {
  const wrapperRef = useRef(null);
  const popupRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [anchor, setAnchor] = useState(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const tipId = useId();

  const showFromEvent = useCallback(
    (event) => {
      if (placement === "above") {
        setAnchor({ placement: "above" });
      } else {
        setAnchor({ placement: "cursor", x: event.clientX, y: event.clientY });
      }
      setVisible(true);
    },
    [placement]
  );

  const hide = useCallback(() => {
    setVisible(false);
    setAnchor(null);
  }, []);

  /** After paint, measure popup and clamp within the viewport. */
  useLayoutEffect(() => {
    if (!visible || !anchor || !popupRef.current) {
      return;
    }
    const popup = popupRef.current;
    const width = popup.offsetWidth;
    const height = popup.offsetHeight;
    let left;
    let top;

    if (anchor.placement === "above" && wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      left = rect.left + rect.width / 2 - width / 2;
      top = rect.top - height - 10;
    } else {
      left = (anchor.x ?? 0) + 12;
      top = (anchor.y ?? 0) + 12;
    }

    left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(left, window.innerWidth - width - VIEWPORT_MARGIN)
    );
    top = Math.max(
      VIEWPORT_MARGIN,
      Math.min(top, window.innerHeight - height - VIEWPORT_MARGIN)
    );
    setPosition({ left, top });
  }, [visible, anchor, text]);

  return (
    <span
      ref={wrapperRef}
      className={`hover-help ${className}`.trim()}
      onMouseEnter={showFromEvent}
      onMouseMove={placement === "cursor" ? showFromEvent : undefined}
      onMouseLeave={hide}
      onFocus={showFromEvent}
      onBlur={hide}
      aria-describedby={visible ? tipId : undefined}
    >
      {children}
      {visible && (
        <span
          ref={popupRef}
          id={tipId}
          className={`hover-help__popup${
            placement === "above" ? " hover-help__popup--nav" : ""
          }`}
          role="tooltip"
          style={{
            left: position.left,
            top: position.top,
            maxWidth: POPUP_MAX_WIDTH,
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
