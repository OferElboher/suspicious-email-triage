const { effectiveVerdict, effectiveRecommendedAction } = require("../src/lib/effectiveVerdict");

describe("effectiveVerdict", () => {
  it("prefers analyst override over automated analysisResult", () => {
    const review = {
      analysisResult: { verdict: "benign", recommendedAction: "close" },
      override: { verdict: "likely_phishing", recommendedAction: "report_and_block" },
    };
    expect(effectiveVerdict(review)).toBe("likely_phishing");
    expect(effectiveRecommendedAction(review)).toBe("report_and_block");
  });

  it("falls back to analysisResult when no override", () => {
    const review = { analysisResult: { verdict: "suspicious" } };
    expect(effectiveVerdict(review)).toBe("suspicious");
  });
});
