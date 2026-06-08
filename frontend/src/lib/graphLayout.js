/**
 * Pure helpers for campaign subgraph SVG layout (no React dependency — easy to unit test).
 * Pattern: circular layout keeps the bundle free of D3/vis-network.
 */

/** Default canvas size for one campaign subgraph. */
export const GRAPH_CANVAS_WIDTH = 720;
export const GRAPH_CANVAS_HEIGHT = 420;
export const GRAPH_CANVAS_MIN_HEIGHT = 280;
export const GRAPH_CANVAS_MAX_HEIGHT = 900;
export const GRAPH_CANVAS_MIN_WIDTH = 480;
export const GRAPH_CANVAS_MAX_WIDTH = 1200;

/** Minimum and maximum zoom scale for analyst pan/zoom controls. */
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2.5;
export const ZOOM_STEP = 0.15;

/** Color map by Neo4j node label for quick visual scanning. */
export const NODE_COLORS = {
  Sender: "#4f8cff",
  Review: "#ffb347",
  Url: "#ff6b6b",
  Domain: "#c44dff",
  Campaign: "#2ecc71",
  Unknown: "#888",
};

/**
 * Place nodes evenly on a circle so small campaign graphs stay readable.
 * @param {Array<{id:string, label:string, type:string}>} nodes
 */
export function layoutNodesOnCircle(nodes, width = GRAPH_CANVAS_WIDTH, height = GRAPH_CANVAS_HEIGHT) {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.32;
  return nodes.map((node, index) => {
    const angle = (2 * Math.PI * index) / Math.max(nodes.length, 1);
    return {
      ...node,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });
}

/** Sort campaigns largest-first by linked review count (matches Neo4j listCampaigns order). */
export function sortCampaignsBySize(campaigns) {
  return [...(campaigns || [])].sort(
    (a, b) => Number(b.reviewCount || 0) - Number(a.reviewCount || 0)
  );
}

/** Human-readable tooltip text for a graph node (hover box in GraphView). */
export function describeNode(node) {
  if (!node) return "";
  const props = node.properties || {};
  const lines = [`Type: ${node.type}`, `Label: ${node.label}`];
  if (props.email) lines.push(`Email: ${props.email}`);
  if (props.id) lines.push(`Review id: ${props.id}`);
  if (props.href) lines.push(`URL: ${props.href}`);
  if (props.host) lines.push(`Domain: ${props.host}`);
  if (props.indicator) lines.push(`Campaign indicator: ${props.indicator}`);
  if (props.verdict) lines.push(`Verdict: ${props.verdict}`);
  if (props.status) lines.push(`Status: ${props.status}`);
  return lines.join("\n");
}

/** Human-readable tooltip for a relationship edge. */
export function describeEdge(edge) {
  if (!edge) return "";
  return `Relationship: ${edge.label || "LINK"}\nFrom: ${edge.source}\nTo: ${edge.target}`;
}

/** Clamp zoom scale to supported range. */
export function clampZoom(scale) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));
}

/**
 * Find first campaign index whose Neo4j updatedAt falls on YYYY-MM-DD (client-side date jump).
 * @param {Array<{updatedAt?:string}>} campaigns
 * @param {string} dateStr — YYYY-MM-DD from <input type="date">
 * @returns {number|null}
 */
export function findCampaignIndexForDate(campaigns, dateStr) {
  const target = String(dateStr || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) {
    return null;
  }
  const idx = (campaigns || []).findIndex(
    (c) => String(c.updatedAt || "").slice(0, 10) === target
  );
  return idx >= 0 ? idx : null;
}

/**
 * Remove nodes with no incident edges (orphans from stale Neo4j rows or query gaps).
 * Keeps anchor types (Campaign) so the cluster label always renders.
 */
export function filterConnectedGraph(nodes, edges, anchorTypes = ["Campaign"]) {
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
  const anchors = new Set(anchorTypes);
  const kept = list.filter((node) => connectedIds.has(node.id) || anchors.has(node.type));
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
