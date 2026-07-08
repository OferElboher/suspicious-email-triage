const {
  populationStdDev,
  volatilityPercentFromStdDev,
  computeArrivalVolatility,
  STD_DEV_CEILING_MS,
} = require("../src/metrics/arrivalVolatility");

jest.mock("../src/models/Review", () => ({
  find: jest.fn(),
}));

const Review = require("../src/models/Review");

describe("arrivalVolatility", () => {
  it("populationStdDev returns 0 for empty input", () => {
    expect(populationStdDev([])).toBe(0);
  });

  it("volatilityPercentFromStdDev maps to 0–100 using ceiling", () => {
    expect(volatilityPercentFromStdDev(0)).toBe(0);
    expect(volatilityPercentFromStdDev(STD_DEV_CEILING_MS)).toBe(100);
    expect(volatilityPercentFromStdDev(STD_DEV_CEILING_MS * 2)).toBe(100);
  });

  it("computeArrivalVolatility derives gap std dev from recent createdAt values", async () => {
    const base = Date.now() - 60_000;
    const times = [0, 1000, 5000, 5100, 10_000].map((offset) => ({ createdAt: new Date(base + offset) }));
    const chain = {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([...times].reverse()),
    };
    Review.find.mockReturnValue(chain);

    const result = await computeArrivalVolatility();
    expect(result.gapCount).toBe(4);
    expect(result.stdDevMs).toBeGreaterThan(0);
    expect(result.volatilityPercent).toBeGreaterThan(0);
  });

  it("computeArrivalVolatility returns zeros when sample too small", async () => {
    const chain = {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([{ createdAt: new Date() }]),
    };
    Review.find.mockReturnValue(chain);

    const result = await computeArrivalVolatility();
    expect(result.volatilityPercent).toBe(0);
    expect(result.gapCount).toBe(0);
  });
});
