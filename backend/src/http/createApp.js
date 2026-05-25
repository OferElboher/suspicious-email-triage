/** Express app factory: middleware + routes only (no listen). */
const express = require("express");
const cors = require("cors");
const logger = require("../lib/logger");
const reviewRoutes = require("../api/reviews");
const metricsRoutes = require("../api/metrics");
const authRoutes = require("../api/auth");
const adminUserRoutes = require("../api/adminUsers");
const devRoutes = require("../dev/devRoutes");
const { searchLogs } = require("../lib/logSearch");
const { enqueueAfterCreate } = require("../services/reviewPipeline");
const { authenticate, requirePermission } = require("./middleware/auth");

function createApp() {
  const app = express();

  /** CORS: allow browser dev servers to call the API during local development. */
  app.use(
    cors({
      origin: true,
      exposedHeaders: ["Authorization"],
    })
  );

  /** JSON body parser with a conservative size cap to reduce accidental huge payloads. */
  app.use(express.json({ limit: "2mb" }));

  /** Liveness/readiness style endpoint for orchestrators and quick manual checks. */
  app.get("/health", (req, res) => {
    res.json({ status: "ok", service: "triage-api", auth: "required_for_api" });
  });

  /** Public authentication routes (login, password recovery). */
  app.use("/auth", authRoutes);

  /** All routes below require a valid bearer token. */
  app.use(authenticate);

  /** Admin-managed user provisioning and role assignment. */
  app.use("/admin/users", adminUserRoutes);

  /** Core review lifecycle endpoints (create/list/get/override). */
  app.use("/reviews", reviewRoutes);

  /** Dashboard metrics endpoints backed by PostgreSQL statistics. */
  app.use("/metrics", metricsRoutes);

  /** Dev controls + capability advertisement for the SPA (role-gated inside router). */
  app.use("/dev", devRoutes);

  /** Operator log search across the merged JSON-lines log file. */
  app.get("/logs/search", requirePermission("logs.read"), async (req, res) => {
    try {
      const { keyword, topic, from, to, limit } = req.query;
      const result = await searchLogs({
        keyword,
        topic,
        fromTs: from,
        toTs: to,
        limit,
      });
      res.json(result);
    } catch (err) {
      logger.error("api", "log search failed", { error: err.message });
      res.status(500).json({ error: "log_search_failed" });
    }
  });

  /** POST /test — minimal demo ingest (legacy quick path for workshops). */
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
      logger.info("api", "demo review created", { id: String(review._id) });

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
