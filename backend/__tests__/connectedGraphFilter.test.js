const {
  filterZeroDegreeNodes,
  filterToPrimaryComponent,
} = require("../src/lib/connectedGraphFilter");

describe("connectedGraphFilter", () => {
  it("filterZeroDegreeNodes removes nodes with no edges", () => {
    const result = filterZeroDegreeNodes(
      [
        { id: "a", type: "Review" },
        { id: "b", type: "Campaign" },
        { id: "c", type: "Url" },
      ],
      [{ source: "a", target: "b", label: "PART_OF_CAMPAIGN" }]
    );
    expect(result.nodes.map((n) => n.id)).toEqual(["a", "b"]);
    expect(result.droppedOrphanCount).toBe(1);
  });

  it("filterToPrimaryComponent keeps Campaign-anchored component only", () => {
    const nodes = [
      { id: "campaign:main.test", type: "Campaign", label: "main" },
      { id: "review:1", type: "Review", label: "r1" },
      { id: "url:stray", type: "Url", label: "stray" },
      { id: "domain:stray.test", type: "Domain", label: "stray.test" },
    ];
    const edges = [
      { source: "review:1", target: "campaign:main.test", label: "PART_OF_CAMPAIGN" },
      { source: "url:stray", target: "domain:stray.test", label: "RESOLVES_TO" },
    ];
    const filtered = filterToPrimaryComponent(nodes, edges, "campaign:main.test");
    expect(filtered.nodes.map((n) => n.id)).toEqual(["campaign:main.test", "review:1"]);
    expect(filtered.droppedComponentCount).toBe(2);
  });
});
