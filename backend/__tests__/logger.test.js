/**
 * Unit tests for backend/src/lib/logger.js — unified NDJSON merged.log writer.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

describe("logger", () => {
  let tempDir;
  let logPath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "triage-logger-"));
    logPath = path.join(tempDir, "merged.log");
    jest.resetModules();
    process.env.MERGED_LOG_PATH = logPath;
    process.env.SERVICE_NAME = "backend-test";
  });

  afterEach(() => {
    delete process.env.MERGED_LOG_PATH;
    delete process.env.SERVICE_NAME;
    fs.rmSync(tempDir, { recursive: true, force: true });
    jest.resetModules();
  });

  it("writes service field from SERVICE_NAME for GET /logs/search?service=…", () => {
    const logger = require("../src/lib/logger");
    logger.info("reviews", "created", { id: "abc" });

    const line = fs.readFileSync(logPath, "utf8").trim();
    const row = JSON.parse(line);
    expect(row.service).toBe("backend-test");
    expect(row.topic).toBe("reviews");
    expect(row.level).toBe("info");
    expect(row.message).toBe("created");
    expect(row.id).toBe("abc");
  });
});
