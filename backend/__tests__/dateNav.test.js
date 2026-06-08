const { dayBoundsUtc, pageIndexForDate } = require("../src/lib/dateNav");

describe("dateNav", () => {
  it("parses YYYY-MM-DD bounds", () => {
    const bounds = dayBoundsUtc("2026-05-24");
    expect(bounds.date).toBe("2026-05-24");
    expect(bounds.start.toISOString()).toBe("2026-05-24T00:00:00.000Z");
  });

  it("computes zero-based page from newer count", () => {
    expect(pageIndexForDate(0, 20)).toBe(0);
    expect(pageIndexForDate(20, 20)).toBe(1);
    expect(pageIndexForDate(25, 20)).toBe(1);
  });
});
