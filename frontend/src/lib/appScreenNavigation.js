/** Primary SPA views mounted by TriageApp. */
export const APP_SCREENS = ["workspace", "analytics", "graph"];

/** Read the active view from the location hash (e.g. #analytics). */
export function readScreenFromLocation() {
  const hash = window.location.hash.replace(/^#/, "").toLowerCase();
  return APP_SCREENS.includes(hash) ? hash : "workspace";
}

/** Persist the active view in the URL hash without a full navigation. */
export function writeScreenToLocation(screen) {
  if (!APP_SCREENS.includes(screen)) {
    return;
  }
  const hash = screen === "workspace" ? "" : `#${screen}`;
  const nextUrl = `${window.location.pathname}${window.location.search}${hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (currentUrl !== nextUrl) {
    window.history.replaceState(null, "", nextUrl);
  }
}
