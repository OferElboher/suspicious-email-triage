/**
 * Inline SVG icons for the primary app navigation bar.
 *
 * Pattern: stroke-based 24×24 icons at 2px weight — readable at ~2rem inside round
 * nav buttons. Technology: plain SVG + currentColor (no icon font/npm package).
 */

const STROKE = 2;
const COMMON = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: STROKE,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: "false",
};

/** Review dashboard — clipboard with checklist lines (triage queue metaphor). */
export function IconDashboard({ className = "nav-icon__svg" }) {
  return (
    <svg className={className} {...COMMON}>
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  );
}

/** Analytics — bar chart with baseline (metrics / KPIs). */
export function IconAnalytics({ className = "nav-icon__svg" }) {
  return (
    <svg className={className} {...COMMON}>
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <rect x="7" y="10" width="3" height="10" rx="0.5" fill="currentColor" stroke="none" />
      <rect x="12" y="6" width="3" height="14" rx="0.5" fill="currentColor" stroke="none" />
      <rect x="17" y="13" width="3" height="7" rx="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Phishing graph — hub node linked to three leaf nodes (relationship view). */
export function IconGraph({ className = "nav-icon__svg" }) {
  return (
    <svg className={className} {...COMMON}>
      <circle cx="12" cy="5" r="2.5" fill="currentColor" stroke="none" />
      <circle cx="5" cy="19" r="2.5" fill="currentColor" stroke="none" />
      <circle cx="19" cy="19" r="2.5" fill="currentColor" stroke="none" />
      <path d="M12 7.5v3M10.2 10.8 6.8 16.5M13.8 10.8l3.4 5.7" />
    </svg>
  );
}

/** Unified logs — magnifying glass over stacked log lines (search + records). */
export function IconLogs({ className = "nav-icon__svg" }) {
  return (
    <svg className={className} {...COMMON}>
      <path d="M6 4h8l4 4v12H6z" />
      <path d="M14 4v4h4" />
      <path d="M8 12h8M8 16h5" />
      <circle cx="16.5" cy="16.5" r="3.5" />
      <path d="m19 19 2.5 2.5" />
    </svg>
  );
}

/** User administration — person silhouette with shield (RBAC / admin gateway). */
export function IconAdmin({ className = "nav-icon__svg" }) {
  return (
    <svg className={className} {...COMMON}>
      <circle cx="10" cy="8" r="3" />
      <path d="M4 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1" />
      <path d="M17 4h3v5a3 3 0 0 1-6 0V4z" />
      <path d="M18.5 4v1.5" />
    </svg>
  );
}

/** Settings — gear with visible teeth (preferences / theme). */
export function IconSettings({ className = "nav-icon__svg" }) {
  return (
    <svg className={className} {...COMMON}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
      <path d="M12 5.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z" opacity="0.35" />
    </svg>
  );
}
