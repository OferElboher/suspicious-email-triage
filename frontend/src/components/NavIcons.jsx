/**
 * Inline SVG icons for the primary app navigation bar (uniform 20×20, currentColor).
 * Pattern: icon-only buttons + HoverHelp label on hover — saves header space.
 */

/** Review dashboard — clipboard list. */
export function IconDashboard({ className = "nav-icon__svg" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm0 2v14h10V5H7zm2 3h6v2H9V8zm0 4h6v2H9v-2z"
      />
    </svg>
  );
}

/** Analytics charts — bar chart. */
export function IconAnalytics({ className = "nav-icon__svg" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M5 19h2V9H5v10zm4 0h2V5H9v14zm4 0h2v-7h-2v7zm4 0h2V3h-2v16z"
      />
    </svg>
  );
}

/** Phishing graph — three connected nodes. */
export function IconGraph({ className = "nav-icon__svg" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="5" r="2.5" fill="currentColor" />
      <circle cx="5" cy="19" r="2.5" fill="currentColor" />
      <circle cx="19" cy="19" r="2.5" fill="currentColor" />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        d="M12 7.5L5.5 16.5M12 7.5l6.5 9M5.5 16.5h13"
      />
    </svg>
  );
}

/** Unified logs — document lines. */
export function IconLogs({ className = "nav-icon__svg" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M6 2h9l5 5v15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm8 1.5V8h4.5L14 3.5zM7 11h10v2H7v-2zm0 4h10v2H7v-2z"
      />
    </svg>
  );
}

/** User administration — people. */
export function IconAdmin({ className = "nav-icon__svg" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9v-1.2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5V21H4zm14-9.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM20 21v-1a4 4 0 0 0-3-3.87"
      />
    </svg>
  );
}

/** Settings — gear. */
export function IconSettings({ className = "nav-icon__svg" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm8.94 3a7.96 7.96 0 0 0-.12-1l2.03-1.58-1.92-3.32-2.39.96a8.05 8.05 0 0 0-1.73-1l-.36-2.54H9.75l-.36 2.54a8.05 8.05 0 0 0-1.73 1l-2.39-.96-1.92 3.32L3.18 11a7.96 7.96 0 0 0 0 2l-2.03 1.58 1.92 3.32 2.39-.96c.52.43 1.1.78 1.73 1l.36 2.54h4.5l.36-2.54c.63-.22 1.21-.57 1.73-1l2.39.96 1.92-3.32L20.82 13c.08-.33.12-.66.12-1z"
      />
    </svg>
  );
}
