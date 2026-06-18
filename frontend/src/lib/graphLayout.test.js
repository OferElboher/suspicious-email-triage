import {
  sortCampaignsBySize,
  layoutNodesOnCircle,
  describeNode,
  clampZoom,
  findCampaignIndexForDate,
  filterConnectedGraph,
  filterToPrimaryComponent,
  hasDisplayableGraph,
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

  it("hasDisplayableGraph is false when edges are empty even if nodes exist", () => {
    expect(
      hasDisplayableGraph(
        [{ id: "campaign:x", type: "Campaign", label: "x" }],
        []
      )
    ).toBe(false);
    expect(
      hasDisplayableGraph(
        [
          { id: "r:1", type: "Review", label: "r" },
          { id: "c:1", type: "Campaign", label: "c" },
        ],
        [{ source: "r:1", target: "c:1", label: "PART_OF_CAMPAIGN" }]
      )
    ).toBe(true);
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

  it("filterToPrimaryComponent hides secondary connected components", () => {
    const nodes = [
      { id: "campaign:x.test", type: "Campaign", label: "x" },
      { id: "review:1", type: "Review", label: "r1" },
      { id: "url:orphan", type: "Url", label: "u" },
      { id: "domain:orphan.test", type: "Domain", label: "d" },
    ];
    const edges = [
      { source: "review:1", target: "campaign:x.test", label: "PART_OF_CAMPAIGN" },
      { source: "url:orphan", target: "domain:orphan.test", label: "RESOLVES_TO" },
    ];
    const filtered = filterToPrimaryComponent(nodes, edges, "campaign:x.test");
    expect(filtered.nodes.map((n) => n.id)).toEqual(["campaign:x.test", "review:1"]);
    expect(filtered.droppedComponentCount).toBe(2);
  });

  it("filterToPrimaryComponent dedupes nodes with the same id", () => {
    const nodes = [
      { id: "sender:a@test", type: "Sender", label: "a" },
      { id: "sender:a@test", type: "Sender", label: "a-dup" },
      { id: "review:1", type: "Review", label: "r" },
      { id: "campaign:x.test", type: "Campaign", label: "x" },
    ];
    const edges = [
      { source: "sender:a@test", target: "review:1", label: "SENT" },
      { source: "review:1", target: "campaign:x.test", label: "PART_OF_CAMPAIGN" },
    ];
    const filtered = filterToPrimaryComponent(nodes, edges, "campaign:x.test");
    expect(filtered.nodes.filter((n) => n.id === "sender:a@test")).toHaveLength(1);
    expect(filtered.droppedDuplicateCount).toBe(1);
  });
});
