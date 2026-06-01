/** Lightweight request counter middleware for Prometheus metrics (TBD 1.4). */
const { incrementHttpRequests, incrementHttpErrors } = require("../../lib/appMetrics");

/** Count requests and 5xx responses without logging every path (low overhead). */
function metricsMiddleware(req, res, next) {
  incrementHttpRequests();
  res.on("finish", () => {
    if (res.statusCode >= 500) {
      incrementHttpErrors();
    }
  });
  next();
}

module.exports = { metricsMiddleware };
