const fs = require("fs");
const os = require("os");
const path = require("path");

describe("logSearch", () => {
  let tempDir;
  let logPath;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "triage-log-"));
    logPath = path.join(tempDir, "merged.log");
    jest.resetModules();
    jest.doMock("../src/lib/logger", () => ({ mergedPath: logPath }));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    jest.resetModules();
  });

  it("compileRegex returns null for invalid patterns", () => {
    const { compileRegex } = require("../src/lib/logSearch");
    expect(compileRegex("(")).toBeNull();
    expect(compileRegex("failed")).toBeTruthy();
  });

  it("rowMatchesFilters respects level and regex keyword", () => {
    const { rowMatchesFilters, compileRegex } = require("../src/lib/logSearch");
    const row = {
      ts: "2026-06-01T12:00:00Z",
      level: "error",
      topic: "celery",
      message: "task failed",
    };
    expect(
      rowMatchesFilters(row, {
        topicSubstr: "celery",
        levelExact: "error",
        fromMs: null,
        toMs: null,
        keywordLower: "failed",
        keywordRegex: null,
        messageRegex: null,
        serviceExact: null,
      })
    ).toBe(true);
    const regex = compileRegex("task\\s+failed");
    expect(
      rowMatchesFilters(row, {
        topicSubstr: "",
        levelExact: null,
        fromMs: null,
        toMs: null,
        keywordLower: null,
        keywordRegex: regex,
        messageRegex: null,
        serviceExact: null,
      })
    ).toBe(true);
  });

  it("searchLogs filters merged.log lines by level", async () => {
    fs.writeFileSync(
      logPath,
      [
        JSON.stringify({ ts: "2026-06-01T10:00:00Z", level: "info", topic: "api", message: "ok" }),
        JSON.stringify({
          ts: "2026-06-01T11:00:00Z",
          level: "error",
          topic: "celery",
          message: "boom",
        }),
      ].join("\n")
    );

    const { searchLogs } = require("../src/lib/logSearch");
    const result = await searchLogs({ level: "error", limit: 10 });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].message).toBe("boom");
    expect(result.totalMatched).toBe(1);
  });
});
