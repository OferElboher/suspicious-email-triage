/**
 * Create React App dev-server proxy — forwards API paths to Express on port 3000.
 * Pattern: same-origin requests from :3001 avoid CORS and Windows/WSL localhost quirks.
 */
const { createProxyMiddleware } = require("http-proxy-middleware");

/** API path prefixes served by the Node backend (not static React assets). */
const API_PREFIXES = [
  "/auth",
  "/health",
  "/reviews",
  "/metrics",
  "/graph",
  "/dev",
  "/logs",
  "/ops",
  "/search",
  "/test",
];

/** Register proxy middleware when `npm start` runs the CRA dev server. */
module.exports = function setupProxy(app) {
  app.use(
    API_PREFIXES,
    createProxyMiddleware({
      target: process.env.REACT_APP_PROXY_TARGET || "http://localhost:3000",
      changeOrigin: true,
      logLevel: "warn",
    })
  );
};
