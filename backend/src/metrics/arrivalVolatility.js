/**
 * Ingest arrival volatility — standard deviation of inter-arrival gaps between recent reviews.
 *
 * Pattern: SOC dashboards often show “burstiness” (traffic arrives in clumps vs steady drip).
 * Technology: MongoDB `find().sort({ createdAt: -1 }).limit(N)` then sample std dev in Node.
 *
 * High std dev ⇒ arrivals are irregular ⇒ volatility needle rises (frontend adds micro-jitter for demo).
 */
const Review = require("../models/Review");

/** How many recent reviews to sample for gap statistics (newest first in query). */
const SAMPLE_LIMIT = 40;

/** Gap std dev (ms) mapped to 100% needle — above this feels “furiously bursty” on a laptop demo. */
const STD_DEV_CEILING_MS = 5000;

/**
 * Compute population standard deviation of an array of numbers.
 * @param {number[]} values
 * @returns {number}
 */
function populationStdDev(values) {
  if (!values.length) {
    return 0;
  }
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Map inter-arrival std dev (milliseconds) to a 0–100 gauge percent.
 * @param {number} stdDevMs
 * @returns {number}
 */
function volatilityPercentFromStdDev(stdDevMs) {
  return Math.min(100, Math.round((Math.max(0, stdDevMs) / STD_DEV_CEILING_MS) * 100));
}

/**
 * Measure how irregular recent review arrivals are (milliseconds between creates).
 * @returns {Promise<{ sampleSize: number, gapCount: number, meanGapMs: number, stdDevMs: number, volatilityPercent: number }>}
 */
async function computeArrivalVolatility() {
  const docs = await Review.find({}, { createdAt: 1 })
    .sort({ createdAt: -1 })
    .limit(SAMPLE_LIMIT)
    .lean();

  if (docs.length < 3) {
    return {
      sampleSize: docs.length,
      gapCount: 0,
      meanGapMs: 0,
      stdDevMs: 0,
      volatilityPercent: 0,
    };
  }

  /** Chronological order so gaps are positive deltas between consecutive arrivals. */
  const times = docs
    .map((d) => new Date(d.createdAt).getTime())
    .filter((t) => Number.isFinite(t))
    .reverse();

  const gaps = [];
  for (let i = 1; i < times.length; i += 1) {
    gaps.push(times[i] - times[i - 1]);
  }

  const meanGapMs = gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  const stdDevMs = populationStdDev(gaps);

  return {
    sampleSize: docs.length,
    gapCount: gaps.length,
    meanGapMs: Math.round(meanGapMs),
    stdDevMs: Math.round(stdDevMs),
    volatilityPercent: volatilityPercentFromStdDev(stdDevMs),
  };
}

module.exports = {
  SAMPLE_LIMIT,
  STD_DEV_CEILING_MS,
  populationStdDev,
  volatilityPercentFromStdDev,
  computeArrivalVolatility,
};
