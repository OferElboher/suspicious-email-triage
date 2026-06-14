/**
 * Reads merged JSON-lines log and filters by time range, topic, level, keyword, and regex.
 *
 * Pattern: streaming readline over `merged.log` (central logging) — no Elasticsearch required.
 * Technology: Node.js fs + readline; optional RegExp when `regex=true`.
 */
const fs = require("fs");
const readline = require("readline");
const { mergedPath } = require("./logger");

/** Compile a safe RegExp or return null when the pattern is invalid. */
function compileRegex(pattern, flags = "i") {
  if (!pattern) {
    return null;
  }
  try {
    return new RegExp(String(pattern), flags);
  } catch {
    return null;
  }
}

/** Return true when a log row matches optional level/topic/time/keyword/regex filters. */
function rowMatchesFilters(row, filters) {
  const {
    topicSubstr,
    levelExact,
    fromMs,
    toMs,
    keywordLower,
    keywordRegex,
    messageRegex,
    serviceExact,
  } = filters;

  const ts = Date.parse(row.ts);
  if (fromMs != null && !Number.isNaN(ts) && ts < fromMs) {
    return false;
  }
  if (toMs != null && !Number.isNaN(ts) && ts > toMs) {
    return false;
  }
  if (levelExact && String(row.level || "").toLowerCase() !== levelExact) {
    return false;
  }
  if (topicSubstr && String(row.topic || "").toLowerCase().indexOf(topicSubstr) === -1) {
    return false;
  }
  if (serviceExact && String(row.service || "").toLowerCase() !== serviceExact) {
    return false;
  }
  const message = String(row.message || "");
  const blob = `${message} ${JSON.stringify(row)}`;
  if (keywordRegex && !keywordRegex.test(blob)) {
    return false;
  }
  if (!keywordRegex && keywordLower && blob.toLowerCase().indexOf(keywordLower) === -1) {
    return false;
  }
  if (messageRegex && !messageRegex.test(message)) {
    return false;
  }
  return true;
}

/**
 * Search unified merged.log with optional advanced filters.
 *
 * Query params (HTTP layer maps these):
 * - keyword, topic, from, to, limit (legacy/simple)
 * - level, service, regex=true, messagePattern, offset
 */
async function searchLogs({
  keyword = "",
  topic = "",
  fromTs = null,
  toTs = null,
  limit = 200,
  offset = 0,
  level = "",
  service = "",
  regex = false,
  messagePattern = "",
} = {}) {
  const max = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 2000);
  const skip = Math.max(parseInt(offset, 10) || 0, 0);
  const useRegex = String(regex).toLowerCase() === "true" || regex === true;
  const keywordRegex = useRegex ? compileRegex(keyword) : null;
  const messageRegex = compileRegex(messagePattern || "");
  const filters = {
    topicSubstr: String(topic || "").toLowerCase(),
    levelExact: String(level || "").toLowerCase() || null,
    serviceExact: String(service || "").toLowerCase() || null,
    fromMs: fromTs ? Date.parse(fromTs) : null,
    toMs: toTs ? Date.parse(toTs) : null,
    keywordLower: useRegex ? null : String(keyword || "").toLowerCase(),
    keywordRegex,
    messageRegex,
  };

  if (!fs.existsSync(mergedPath)) {
    return { path: mergedPath, entries: [], truncated: false, offset: skip, totalMatched: 0 };
  }

  const matched = [];
  let totalMatched = 0;
  const stream = fs.createReadStream(mergedPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) {
      continue;
    }
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (!rowMatchesFilters(row, filters)) {
      continue;
    }
    totalMatched += 1;
    if (totalMatched <= skip) {
      continue;
    }
    matched.push(row);
    if (matched.length >= max) {
      return {
        path: mergedPath,
        entries: matched,
        truncated: true,
        offset: skip,
        totalMatched,
      };
    }
  }

  return {
    path: mergedPath,
    entries: matched,
    truncated: false,
    offset: skip,
    totalMatched,
  };
}

module.exports = { searchLogs, compileRegex, rowMatchesFilters };
