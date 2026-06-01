/** Guardrail: metrics middleware must resolve appMetrics from http/middleware depth. */
const fs = require("fs");
const path = require("path");

describe("metrics middleware imports", () => {
  it("requires appMetrics via ../../lib (middleware is one level deeper than api/)", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/http/middleware/metrics.js"),
      "utf8"
    );
    expect(src).toContain('require("../../lib/appMetrics")');
    expect(src).not.toContain('require("../lib/appMetrics")');
  });
});
