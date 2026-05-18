/**
 * Reads merged JSON-lines log and filters by optional time range, topic substring, keyword.
 */
const fs = require("fs");
const readline = require("readline");
const { mergedPath } = require("./logger");

async function searchLogs({
  keyword = "",
  topic = "",
  fromTs = null,
  toTs = null,
  limit = 200,
} = {}) {
  const max = Math.min(Math.max(parseInt(limit, 10) || 200, 1), 2000);
  const kw = keyword.toLowerCase();
  const tp = topic.toLowerCase();
  const from = fromTs ? Date.parse(fromTs) : null;
  const to = toTs ? Date.parse(toTs) : null;

  if (!fs.existsSync(mergedPath)) {
    return { path: mergedPath, entries: [], truncated: false };
  }

  const entries = [];
  const stream = fs.createReadStream(mergedPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (from && Date.parse(row.ts) < from) continue;
    if (to && Date.parse(row.ts) > to) continue;
    if (tp && String(row.topic || "").toLowerCase().indexOf(tp) === -1) {
      continue;
    }
    if (kw) {
      const blob = `${row.message} ${JSON.stringify(row)}`.toLowerCase();
      if (blob.indexOf(kw) === -1) continue;
    }
    entries.push(row);
    if (entries.length >= max) {
      return { path: mergedPath, entries, truncated: true };
    }
  }
  return { path: mergedPath, entries, truncated: false };
}

module.exports = { searchLogs };
