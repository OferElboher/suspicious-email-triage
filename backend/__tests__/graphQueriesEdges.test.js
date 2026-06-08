const { edgesFromNeo4j, nodeToJson } = require("../src/graph/graphQueries");

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
});
