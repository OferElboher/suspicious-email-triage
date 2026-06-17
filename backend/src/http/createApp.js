/**
 * Express app factory: middleware + routes only (no listen).
 */
const express = require("express");
const cors = require("cors");
const logger = require("../lib/logger");
const reviewRoutes = require("../api/reviews");
const metricsRoutes = require("../api/metrics");
const graphRoutes = require("../api/graph");
const graphInternalRoutes = require("../api/graphInternal");
const authRoutes = require("../api/auth");
const healthRoutes = require("../api/health");
const opsRoutes = require("../api/ops");
const searchRoutes = require("../api/search");
const analyticsRoutes = require("../api/analytics");
const devRoutes = require("../dev/devRoutes");
const { searchLogs } = require("../lib/logSearch");
const { enqueueAfterCreate } = require("../services/reviewPipeline");
const { authenticate, requirePermission } = require("./middleware/auth");
const { metricsMiddleware } = require("./middleware/metrics");

/** Build configured Express application (used by server.js and Jest supertest). */
function createApp() {
  const app = express();

  app.use(
    cors({
      origin: true,
      exposedHeaders: ["Authorization"],
    })
  );

  app.use(express.json({ limit: "2mb" }));
  app.use(metricsMiddleware);

  /** Health probes — public, no JWT (Docker/Kubernetes pattern). */
  app.use("/health", healthRoutes);

  /** Prometheus scrape + ops alerts — public /ops/prometheus only. */
  app.use("/ops", opsRoutes);

  app.use("/auth", authRoutes);
  app.use("/graph/internal", graphInternalRoutes);

  app.use(authenticate);

  app.use("/reviews", reviewRoutes);
  app.use("/metrics", metricsRoutes);
  app.use("/graph", graphRoutes);
  app.use("/search", searchRoutes);
  app.use("/analytics", analyticsRoutes);
  app.use("/dev", devRoutes);

  app.get("/logs/search", requirePermission("logs.read"), async (req, res) => {
    try {
      const {
        keyword,
        topic,
        from,
        to,
        limit,
        offset,
        level,
        service,
        regex,
        messagePattern,
      } = req.query;
      const result = await searchLogs({
        keyword,
        topic,
        fromTs: from,
        toTs: to,
        limit,
        offset,
        level,
        service,
        regex,
        messagePattern,
      });
      res.json(result);
    } catch (err) {
      logger.error("api", "log search failed", { error: err.message });
      res.status(500).json({ error: "log_search_failed" });
    }
  });

  app.post("/test", requirePermission("reviews.write"), async (req, res) => {
    try {
      const Review = require("../models/Review");

      const { body, subject } = req.body;
      if (!body) {
        return res.status(400).json({ error: "body_required" });
      }
      const review = await Review.create({
        body,
        subject: subject || "no subject",
        senderEmail: req.auth.email,
        senderName: req.auth.email.split("@")[0],
        status: "pending",
      });
      logger.info("api", "test review created", { id: String(review._id) });

      await enqueueAfterCreate(review._id);

      res.json({ ok: true, reviewId: review._id });
    } catch (err) {
      logger.error("api", "/test failed", { error: err.message });
      res.status(500).json({ error: "internal_error" });
    }
  });

  return app;
}

module.exports = { createApp };
