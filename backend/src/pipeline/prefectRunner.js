/**
 * Prefect flow bridge — invokes orchestration.prefect_demo.review_stats_flow when Python is available.
 *
 * Prefect is a Python workflow orchestrator (@task / @flow). The triage API exposes its health-check
 * flow to the React analytics tab. When Python/psycopg is unavailable (minimal Node Docker image),
 * we fall back to equivalent SQL in Node — same result, labeled source=nodejs-fallback.
 */
const { spawnSync } = require("child_process");
const path = require("path");
const { Pool } = require("pg");
const { statsPgUrl } = require("../config/runtime");
const { ensureStatsSchema } = require("../stats/statsPg");

/** pool: Postgres for Node fallback count (mirrors stats_task.py). */
const pool = new Pool({ connectionString: statsPgUrl() });

/** Prefect flow name registered in orchestration/prefect_demo/flows.py. */
const PREFECT_FLOW_NAME = "review-stats-health-check";

/**
 * Resolve repository root from backend/src/pipeline (…/suspicious-email-triage).
 * @returns {string}
 */
function repoRootPath() {
  return path.resolve(__dirname, "../../..");
}

/**
 * Candidate Python interpreters — host dev may use ai_service venv; override via PIPELINE_PYTHON.
 * @returns {string[]}
 */
function pythonCandidates() {
  const root = repoRootPath();
  const fromEnv = process.env.PIPELINE_PYTHON || process.env.PREFECT_PYTHON;
  return [
    fromEnv,
    path.join(root, "ai_service/.venv/bin/python"),
    path.join(root, "ai_service/.venv/bin/python3"),
    "python3",
    "python",
  ].filter(Boolean);
}

/**
 * Run review_stats_flow via subprocess; returns null when Python/orchestration unavailable.
 * @param {number} hours
 * @returns {object|null}
 */
function tryPrefectSubprocess(hours) {
  const root = repoRootPath();
  const script = `
import json, sys
sys.path.insert(0, ${JSON.stringify(root)})
from orchestration.prefect_demo.flows import review_stats_flow
print(json.dumps(review_stats_flow(${hours})))
`;
  for (const pythonBin of pythonCandidates()) {
    try {
      const result = spawnSync(pythonBin, ["-c", script], {
        env: { ...process.env, PYTHONPATH: root },
        encoding: "utf8",
        timeout: 8000,
      });
      if (result.status === 0 && result.stdout) {
        const parsed = JSON.parse(result.stdout.trim());
        return {
          ...parsed,
          source: "prefect-flow",
          flowName: PREFECT_FLOW_NAME,
          orchestrator: "prefect",
        };
      }
    } catch (_err) {
      /* try next interpreter */
    }
  }
  return null;
}

/**
 * Node fallback — same COUNT query as orchestration/prefect_demo/stats_task.py.
 * @param {number} hours
 * @returns {Promise<object>}
 */
async function nodePrefectEquivalent(hours) {
  await ensureStatsSchema();
  const windowStart = new Date(Date.now() - hours * 60 * 60 * 1000);
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM review_stats_events WHERE occurred_at >= $1`,
    [windowStart]
  );
  return {
    hours,
    eventCount: rows[0]?.count ?? 0,
    windowStart: windowStart.toISOString(),
    source: "nodejs-fallback",
    flowName: PREFECT_FLOW_NAME,
    orchestrator: "prefect-pattern-equivalent",
    hint: "Install Python + orchestration on the API host or set PIPELINE_PYTHON for live Prefect flow execution.",
  };
}

/**
 * Execute Prefect health check (subprocess first, SQL fallback second).
 * @param {number} [hours=24]
 * @returns {Promise<object>}
 */
async function runPrefectHealthCheck(hours = 24) {
  const safeHours = Math.min(Math.max(parseInt(hours, 10) || 24, 1), 168);
  const fromPrefect = tryPrefectSubprocess(safeHours);
  if (fromPrefect) {
    return {
      ...fromPrefect,
      healthy: fromPrefect.eventCount > 0,
      status: fromPrefect.eventCount > 0 ? "ok" : "no_events",
    };
  }
  const fallback = await nodePrefectEquivalent(safeHours);
  return {
    ...fallback,
    healthy: fallback.eventCount > 0,
    status: fallback.eventCount > 0 ? "ok" : "no_events",
  };
}

module.exports = {
  PREFECT_FLOW_NAME,
  runPrefectHealthCheck,
  tryPrefectSubprocess,
  nodePrefectEquivalent,
};
