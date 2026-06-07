import { effectiveVerdict, hasOverride } from "./effectiveVerdict";

describe("effectiveVerdict (frontend)", () => {
  it("shows override verdict in list rows", () => {
    const review = {
      analysisResult: { verdict: "benign" },
      override: { verdict: "likely_phishing" },
    };
    expect(effectiveVerdict(review)).toBe("likely_phishing");
    expect(hasOverride(review)).toBe(true);
  });
});
