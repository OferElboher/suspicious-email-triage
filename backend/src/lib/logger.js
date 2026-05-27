/**
 * JSON-lines merged log: one file, levels info|warn|error|critical, searchable topic/message.
 * In containers prefer MERGED_LOG_PATH=/var/log/triage/merged.log (volume); falls back to ./logs.
 */
const fs = require("fs");
const path = require("path");

const LEVEL_ORDER = { info: 10, warn: 20, error: 30, critical: 40 };

const logDir = process.env.LOG_DIR || path.join(__dirname, "../../logs");
const mergedPath =
  process.env.MERGED_LOG_PATH || path.join(logDir, "merged.log");

function ensureDir() {
  try {
    fs.mkdirSync(path.dirname(mergedPath), { recursive: true });
  } catch (err) {
    console.error("logger: mkdir failed", err.message);
  }
}

function writeLine(level, topic, message, meta = {}) {
  if (!LEVEL_ORDER[level]) {
    level = "info";
  }
  const entry = {
    ts: new Date().toISOString(),
    level,
    topic: String(topic || "app"),
    message: String(message || ""),
    ...meta,
  };
  const line = `${JSON.stringify(entry)}\n`;
  try {
    ensureDir();
    fs.appendFileSync(mergedPath, line, { encoding: "utf8" });
  } catch (err) {
    console.error("logger: append failed", err.message);
  }
  const consoleFn =
    level === "error" || level === "critical" ? console.error : console.log;
  let consoleLine = `[${entry.ts}] [${level}] [${entry.topic}] ${entry.message}`;
  // Dev convenience: surface resetUrl and SMTP hints on console (JSON file still has full meta).
  if (process.env.DEPLOYMENT_ENV !== "prod") {
    if (meta.resetUrl) {
      consoleLine += ` resetUrl=${meta.resetUrl}`;
    }
    if (meta.hint) {
      consoleLine += ` hint=${meta.hint}`;
    }
    if (meta.error && (level === "error" || level === "warn")) {
      consoleLine += ` error=${meta.error}`;
    }
  }
  consoleFn(consoleLine);
}

function log(level, topic, message, meta) {
  writeLine(level, topic, message, meta);
}

module.exports = {
  mergedPath,
  info: (topic, message, meta) => log("info", topic, message, meta),
  warn: (topic, message, meta) => log("warn", topic, message, meta),
  error: (topic, message, meta) => log("error", topic, message, meta),
  critical: (topic, message, meta) => log("critical", topic, message, meta),
  LEVEL_ORDER,
};
