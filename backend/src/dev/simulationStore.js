/**
 * Redis-backed dev simulation settings (on/off, interval) surviving API restarts until dev
 * reset.
 */
const { getRedis } = require("../lib/getRedis");

/** Redis hash key storing JSON simulation settings for all API replicas sharing that Redis. */
const KEY = "triage:dev:simulation";

/**
 * SIMULATION_MAX_EVENTS_PER_MIN: hard ceiling for synthetic events to protect shared dev hosts.
 * Override via env for larger dev machines.
 */
const MAX_EVENTS_PER_MIN = Number(process.env.SIMULATION_MAX_EVENTS_PER_MIN || 30);

/** In-memory fallback mirror when Redis I/O fails (single-process semantics only). */
let memoryFallback = { enabled: false, eventsPerMinute: 2 };

/** Reads simulation JSON from Redis; missing key → disabled defaults. */
async function readSimulation() {
  try {
    const redis = getRedis();
    const raw = await redis.get(KEY);
    if (!raw) {
      return { ...memoryFallback };
    }
    const parsed = JSON.parse(raw);
    memoryFallback = {
      enabled: Boolean(parsed.enabled),
      eventsPerMinute: Number(parsed.eventsPerMinute) || 2,
    };
    return { ...memoryFallback };
  } catch {
    return { ...memoryFallback };
  }
}

/** Writes simulation JSON after clamping rate to a safe ceiling; updates memory mirror too. */
async function writeSimulation(cfg) {
  const safe = {
    enabled: Boolean(cfg.enabled),
    eventsPerMinute: Math.min(
      Math.max(Number(cfg.eventsPerMinute) || 1, 1),
      MAX_EVENTS_PER_MIN
    ),
  };
  memoryFallback = safe;
  try {
    const redis = getRedis();
    await redis.set(KEY, JSON.stringify(safe));
  } catch {
    /* memoryFallback already updated */
  }
  return safe;
}

module.exports = { readSimulation, writeSimulation, KEY, MAX_EVENTS_PER_MIN };
