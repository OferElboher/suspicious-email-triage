import {
  sortCampaignsBySize,
  layoutNodesOnCircle,
  describeNode,
  clampZoom,
  ZOOM_MIN,
  ZOOM_MAX,
} from "./graphLayout";

describe("graphLayout helpers", () => {
  it("sortCampaignsBySize orders by reviewCount descending", () => {
    const sorted = sortCampaignsBySize([
      { indicator: "small.test", reviewCount: 2 },
      { indicator: "big.test", reviewCount: 9 },
    ]);
    expect(sorted[0].indicator).toBe("big.test");
  });

  it("layoutNodesOnCircle assigns x/y to every node", () => {
    const laid = layoutNodesOnCircle([
      { id: "a", label: "A", type: "Review" },
      { id: "b", label: "B", type: "Domain" },
    ]);
    expect(laid).toHaveLength(2);
    expect(typeof laid[0].x).toBe("number");
    expect(typeof laid[0].y).toBe("number");
  });

  it("describeNode includes type and review id", () => {
    const text = describeNode({
      type: "Review",
      label: "subject",
      properties: { id: "mongo123", verdict: "likely_phishing" },
    });
    expect(text).toMatch(/Review id: mongo123/);
    expect(text).toMatch(/likely_phishing/);
  });

  it("clampZoom respects min and max", () => {
    expect(clampZoom(0.1)).toBe(ZOOM_MIN);
    expect(clampZoom(99)).toBe(ZOOM_MAX);
    expect(clampZoom(1)).toBe(1);
  });
});
