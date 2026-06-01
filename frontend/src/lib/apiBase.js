/**
 * Resolve API base URL for fetch calls.
 * Dev: empty string → Create React App setupProxy.js forwards to backend (same origin, no CORS).
 * Prod/build: REACT_APP_API_URL or fallback http://localhost:3000.
 */
export function resolveApiBase() {
  const explicit = String(process.env.REACT_APP_API_URL || "").replace(/\/$/, "");
  if (explicit) {
    return explicit;
  }
  if (process.env.NODE_ENV === "development") {
    return "";
  }
  return "http://localhost:3000";
}

/** OAuth redirects must hit the API host directly (browser navigation, not SPA proxy). */
export function resolveOAuthApiBase() {
  const explicit = String(process.env.REACT_APP_API_URL || "").replace(/\/$/, "");
  return explicit || "http://localhost:3000";
}

/** Turn browser "Failed to fetch" into an actionable message for dev users. */
export function buildNetworkError(original, apiBase) {
  const target = apiBase || "(dev proxy → http://localhost:3000)";
  const err = new Error(
    `Cannot reach the API at ${target}. Start the backend (Docker: triage-backend on port 3000) and wait until ` +
      `curl http://localhost:3000/health/live returns ok, then try again.`
  );
  err.networkError = true;
  err.cause = original;
  return err;
}
