import {
  sortCampaignsBySize,
  layoutNodesOnCircle,
  describeNode,
  clampZoom,
  findCampaignIndexForDate,
  filterConnectedGraph,
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

  it("findCampaignIndexForDate matches Neo4j updatedAt prefix", () => {
    const idx = findCampaignIndexForDate(
      [
        { indicator: "a.test", updatedAt: "2026-05-23" },
        { indicator: "b.test", updatedAt: "2026-05-24T12:00:00Z" },
      ],
      "2026-05-24"
    );
    expect(idx).toBe(1);
  });

  it("filterConnectedGraph drops nodes with no edges including lone Campaign nodes", () => {
    const connected = filterConnectedGraph(
      [
        { id: "c:1", type: "Campaign", label: "c" },
        { id: "r:1", type: "Review", label: "r" },
        { id: "u:1", type: "Url", label: "orphan" },
      ],
      [{ source: "r:1", target: "c:1", label: "PART_OF_CAMPAIGN" }]
    );
    expect(connected.nodes).toHaveLength(2);
    expect(connected.droppedOrphanCount).toBe(1);

    const lone = filterConnectedGraph(
      [{ id: "c:2", type: "Campaign", label: "lonely" }],
      []
    );
    expect(lone.nodes).toHaveLength(0);
  });
});
