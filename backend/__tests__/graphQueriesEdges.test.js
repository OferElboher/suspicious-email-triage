const { edgesFromNeo4j, edgesFromRelTripleRows, nodeToJson, filterConnectedSubgraph } = require("../src/graph/graphQueries");

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

  it("edgesFromRelTripleRows maps a/rel/b Cypher rows to UI edges", () => {
    const senderNode = {
      labels: ["Sender"],
      properties: { email: "a@test.com" },
    };
    const reviewNode = {
      labels: ["Review"],
      properties: { id: "rev1", subject: "Hi" },
    };
    const rel = { type: "SENT" };
    const rows = [
      {
        get: (key) =>
          ({ a: senderNode, rel, b: reviewNode, nodes: [senderNode, reviewNode] }[key]),
      },
    ];
    const edges = edgesFromRelTripleRows(rows);
    expect(edges).toHaveLength(1);
    expect(edges[0].label).toBe("SENT");
    expect(edges[0].source).toBe(nodeToJson(senderNode).id);
    expect(edges[0].target).toBe(nodeToJson(reviewNode).id);
  });

  it("filterConnectedSubgraph removes orphan nodes including lone Campaign rows", () => {
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

  it("filterConnectedSubgraph drops Campaign nodes with zero edges", () => {
    const nodes = [{ id: "campaign:lonely.test", type: "Campaign", label: "lonely" }];
    const filtered = filterConnectedSubgraph(nodes, []);
    expect(filtered.nodes).toHaveLength(0);
    expect(filtered.droppedOrphanCount).toBe(1);
  });

  it("filterConnectedSubgraph keeps only Campaign-anchored component", () => {
    const nodes = [
      { id: "campaign:secure-login.example-phish.test", type: "Campaign", label: "c" },
      { id: "review:1", type: "Review", label: "r1" },
      { id: "url:orphan", type: "Url", label: "orphan" },
      { id: "domain:orphan.test", type: "Domain", label: "orphan.test" },
    ];
    const edges = [
      { source: "review:1", target: "campaign:secure-login.example-phish.test", label: "PART_OF_CAMPAIGN" },
      { source: "url:orphan", target: "domain:orphan.test", label: "RESOLVES_TO" },
    ];
    const filtered = filterConnectedSubgraph(
      nodes,
      edges,
      "campaign:secure-login.example-phish.test"
    );
    expect(filtered.nodes.map((n) => n.id)).toEqual([
      "campaign:secure-login.example-phish.test",
      "review:1",
    ]);
    expect(filtered.droppedComponentCount).toBe(2);
  });
});
