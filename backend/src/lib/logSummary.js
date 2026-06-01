/**
 * Aggregate merged JSON-lines log file by topic/level (central logging free path).
 */
const fs = require("fs");
const readline = require("readline");
const { mergedPath } = require("./logger");

/** Parse one log line JSON safely. */
function parseLine(line) {
  try {
    return JSON.parse(line);
  } catch (_err) {
    return null;
  }
}

/** Count entries by topic and level from the merged log file. */
async function summarizeLogs({ limit = 5000 } = {}) {
  const path = mergedPath;
  if (!fs.existsSync(path)) {
    return {
      path,
      exists: false,
      topics: {},
      levels: {},
      totalLines: 0,
    };
  }

  const topics = {};
  const levels = {};
  let totalLines = 0;

  const stream = fs.createReadStream(path, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: true });

  for await (const line of rl) {
    if (!line.trim()) {
      continue;
    }
    totalLines += 1;
    if (totalLines > limit) {
      break;
    }
    const entry = parseLine(line);
    if (!entry) {
      continue;
    }
    const topic = entry.topic || "unknown";
    const level = entry.level || "info";
    topics[topic] = (topics[topic] || 0) + 1;
    levels[level] = (levels[level] || 0) + 1;
  }

  return {
    path,
    exists: true,
    topics,
    levels,
    totalLinesScanned: totalLines,
    truncated: totalLines >= limit,
  };
}

module.exports = { summarizeLogs };
