/**
 * Agent triage metrics — read-only Mongo aggregates for the Agent Activity UI.
 *
 * Pattern: capped queries (max 25 docs) so laptop dev and prod API stay lightweight.
 * Technology: Mongoose Review model; never scans full email bodies for the list view.
 */
const Review = require("../models/Review");

/** Maximum recent agent runs returned to the SPA (prevents large Mongo reads). */
const RECENT_RUNS_LIMIT = 25;

/**
 * Build a redacted summary row for one review with agentTrace (no email body).
 * @param {object} doc — lean Mongo review document
 * @returns {object}
 */
function summarizeAgentRun(doc) {
  const trace = doc.agentTrace || {};
  const states = trace.statesVisited || [];
  const fallback = states.includes("FALLBACK_RULES");
  return {
    reviewId: String(doc._id),
    subject: doc.subject || "",
    senderEmail: doc.senderEmail || "",
    status: doc.status,
    verdict: doc.analysisResult?.verdict || null,
    updatedAt: doc.updatedAt,
    runId: trace.runId || null,
    provider: trace.provider || null,
    modelId: trace.modelId || null,
    statesVisited: states,
    toolCalls: trace.toolCalls || [],
    guardrailEventCount: (trace.guardrailEvents || []).length,
    wallDurationMs: trace.wallDurationMs ?? null,
    fallback,
    planIntent: trace.plan?.intent || null,
  };
}

/**
 * Fetch agent activity snapshot for GET /metrics/agent-triage.
 * @returns {Promise<object>}
 */
async function getAgentTriageSnapshot() {
  const agentEnabled = String(process.env.AGENT_TRIAGE_ENABLED || "").toLowerCase() === "true";
  const provider = process.env.LLM_CLOUD_PROVIDER || "mock";

  const filter = { agentTrace: { $exists: true, $ne: null } };
  const totalWithTrace = await Review.countDocuments(filter);

  const recentDocs = await Review.find(filter)
    .sort({ updatedAt: -1 })
    .limit(RECENT_RUNS_LIMIT)
    .select(
      "senderEmail subject status updatedAt analysisResult.verdict agentTrace"
    )
    .lean();

  const recentRuns = recentDocs.map(summarizeAgentRun);
  const fallbackCount = recentRuns.filter((r) => r.fallback).length;
  const durations = recentRuns
    .map((r) => r.wallDurationMs)
    .filter((ms) => typeof ms === "number" && ms >= 0);
  const avgWallDurationMs =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;

  const toolTotals = {};
  for (const run of recentRuns) {
    for (const call of run.toolCalls || []) {
      const name = call.name || "unknown";
      toolTotals[name] = (toolTotals[name] || 0) + 1;
    }
  }

  return {
    agentEnabled,
    cloudProvider: provider,
    safetyLimits: {
      maxToolSteps: Number(process.env.AGENT_MAX_TOOL_STEPS || 3),
      maxWallMs: Number(process.env.AGENT_MAX_WALL_MS || 30000),
      maxBodyChars: Number(process.env.AGENT_MAX_BODY_CHARS || 8000),
    },
    summary: {
      reviewsWithTrace: totalWithTrace,
      recentSampleSize: recentRuns.length,
      recentFallbacks: fallbackCount,
      avgWallDurationMs,
      toolCallTotals: toolTotals,
    },
    recentRuns,
  };
}

module.exports = { getAgentTriageSnapshot, summarizeAgentRun, RECENT_RUNS_LIMIT };
