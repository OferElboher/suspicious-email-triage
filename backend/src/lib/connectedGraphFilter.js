/**
 * Pure helpers for trimming Neo4j subgraph payloads before they reach the React SVG canvas.
 *
 * Pattern: two-pass filter —
 *  1) drop nodes with zero incident edges (legacy orphan Url/Domain rows in Neo4j);
 *  2) keep only the connected component anchored on the Campaign node (or the largest
 *     component when no Campaign label is present).
 *
 * Technology: plain JavaScript Sets + BFS (no graph library) so Jest tests stay fast.
 */

/** Build an undirected adjacency list from UI edge rows `{ source, target }`. */
function buildAdjacency(nodes, edges) {
  const adj = new Map();
  (nodes || []).forEach((node) => adj.set(node.id, new Set()));
  (edges || []).forEach((edge) => {
    if (!adj.has(edge.source) || !adj.has(edge.target)) {
      return;
    }
    adj.get(edge.source).add(edge.target);
    adj.get(edge.target).add(edge.source);
  });
  return adj;
}

/** Breadth-first traversal returning every node id reachable from `startId`. */
function bfsReachable(adj, startId) {
  const visited = new Set();
  if (!adj.has(startId)) {
    return visited;
  }
  const queue = [startId];
  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) {
      continue;
    }
    visited.add(id);
    for (const neighbor of adj.get(id) || []) {
      if (!visited.has(neighbor)) {
        queue.push(neighbor);
      }
    }
  }
  return visited;
}

/**
 * Remove nodes that participate in no edges (zero-degree orphans).
 * @returns {{ nodes: object[], edges: object[], droppedOrphanCount: number }}
 */
function filterZeroDegreeNodes(nodes, edges) {
  const list = nodes || [];
  const edgeList = edges || [];
  if (list.length === 0) {
    return { nodes: [], edges: [], droppedOrphanCount: 0 };
  }
  const connectedIds = new Set();
  edgeList.forEach((edge) => {
    connectedIds.add(edge.source);
    connectedIds.add(edge.target);
  });
  const kept = list.filter((node) => connectedIds.has(node.id));
  const keptIds = new Set(kept.map((node) => node.id));
  const keptEdges = edgeList.filter(
    (edge) => keptIds.has(edge.source) && keptIds.has(edge.target)
  );
  return {
    nodes: kept,
    edges: keptEdges,
    droppedOrphanCount: list.length - kept.length,
  };
}

/**
 * After zero-degree filtering, keep a single connected component so analysts never
 * see visually disconnected nodes that still share one edge elsewhere in the payload.
 *
 * Anchor priority: explicit `anchorNodeId` → first `Campaign` node → largest component.
 */
function filterToPrimaryComponent(nodes, edges, anchorNodeId = null) {
  const zeroPass = filterZeroDegreeNodes(nodes, edges);
  const { nodes: connected, edges: connectedEdges } = zeroPass;
  if (!connected.length) {
    return { ...zeroPass, droppedComponentCount: 0 };
  }

  const adj = buildAdjacency(connected, connectedEdges);
  let mainIds = null;

  if (anchorNodeId && adj.has(anchorNodeId)) {
    mainIds = bfsReachable(adj, anchorNodeId);
  } else {
    const campaign = connected.find((node) => node.type === "Campaign");
    if (campaign && adj.has(campaign.id)) {
      mainIds = bfsReachable(adj, campaign.id);
    }
  }

  if (!mainIds || mainIds.size === 0) {
    let largest = new Set();
    const seen = new Set();
    for (const node of connected) {
      if (seen.has(node.id)) {
        continue;
      }
      const comp = bfsReachable(adj, node.id);
      comp.forEach((id) => seen.add(id));
      if (comp.size > largest.size) {
        largest = comp;
      }
    }
    mainIds = largest;
  }

  const kept = connected.filter((node) => mainIds.has(node.id));
  const keptIds = new Set(kept.map((node) => node.id));
  const keptEdges = connectedEdges.filter(
    (edge) => keptIds.has(edge.source) && keptIds.has(edge.target)
  );

  return {
    nodes: kept,
    edges: keptEdges,
    droppedOrphanCount: zeroPass.droppedOrphanCount,
    droppedComponentCount: connected.length - kept.length,
  };
}

module.exports = {
  buildAdjacency,
  bfsReachable,
  filterZeroDegreeNodes,
  filterToPrimaryComponent,
};
