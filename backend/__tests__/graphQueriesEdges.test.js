const { edgesFromNeo4j, nodeToJson, filterConnectedSubgraph } = require("../src/graph/graphQueries");

describe("edgesFromNeo4j", () => {
  it("maps relationships via startNodeElementId/endNodeElementId", () => {
    const senderNode = {
      elementId: "4:abc:0",
      labels: ["Sender"],
      properties: { email: "a@test.com", name: "A" },
    };
    const reviewNode = {
      elementId: "4:abc:1",
      labels: ["Review"],
      properties: { id: "rev1", subject: "Hi", verdict: "likely_phishing" },
    };
    const rel = {
      type: "SENT",
      startNodeElementId: "4:abc:0",
      endNodeElementId: "4:abc:1",
    };
    const edges = edgesFromNeo4j([senderNode, reviewNode], [rel]);
    expect(edges).toHaveLength(1);
    expect(edges[0].label).toBe("SENT");
    expect(edges[0].source).toBe(nodeToJson(senderNode).id);
    expect(edges[0].target).toBe(nodeToJson(reviewNode).id);
  });

  it("filterConnectedSubgraph removes orphan nodes but keeps Campaign anchor", () => {
    const nodes = [
      { id: "campaign:x.test", type: "Campaign", label: "x.test" },
      { id: "review:1", type: "Review", label: "r1" },
      { id: "url:orphan", type: "Url", label: "http://orphan" },
    ];
    const edges = [{ source: "review:1", target: "campaign:x.test", label: "PART_OF_CAMPAIGN" }];
    const filtered = filterConnectedSubgraph(nodes, edges);
    expect(filtered.nodes.map((n) => n.id)).toEqual(["campaign:x.test", "review:1"]);
    expect(filtered.droppedOrphanCount).toBe(1);
  });
});
