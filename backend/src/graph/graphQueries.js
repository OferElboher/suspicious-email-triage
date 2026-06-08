/**
 * Read-side Cypher helpers for graph visualization and neighborhood APIs.
 */
const { runRead } = require("./neo4jClient");

/** Map Neo4j node labels + properties to a stable JSON node id for the UI. */
function nodeToJson(node) {
  const labels = node.labels || [];
  const props = node.properties || {};
  const type = labels[0] || "Unknown";
  let id;
  if (type === "Review") {
    id = `review:${props.id}`;
  } else if (type === "Sender") {
    id = `sender:${props.email}`;
  } else if (type === "Url") {
    id = `url:${props.href}`;
  } else if (type === "Domain") {
    id = `domain:${props.host}`;
  } else if (type === "Campaign") {
    id = `campaign:${props.indicator}`;
  } else {
    id = `${type}:${JSON.stringify(props)}`;
  }
  const label =
    props.subject ||
    props.email ||
    props.href ||
    props.host ||
    props.indicator ||
    type;
  return { id, label: String(label), type, properties: props };
}

/**
 * Build UI edges from Neo4j nodes + relationships.
 * Driver v5 links relationships via startNodeElementId/endNodeElementId (not rel.start nodes).
 */
function edgesFromNeo4j(nodeRecords, relRecords) {
  const jsonByElementId = new Map();
  (nodeRecords || [])
    .filter(Boolean)
    .forEach((node) => {
      jsonByElementId.set(node.elementId, nodeToJson(node));
    });
  const nodeIds = new Set([...jsonByElementId.values()].map((n) => n.id));

  return (relRecords || [])
    .filter(Boolean)
    .map((rel) => {
      const startJson = jsonByElementId.get(rel.startNodeElementId);
      const endJson = jsonByElementId.get(rel.endNodeElementId);
      if (!startJson || !endJson) {
        return null;
      }
      if (!nodeIds.has(startJson.id) || !nodeIds.has(endJson.id)) {
        return null;
      }
      return { source: startJson.id, target: endJson.id, label: rel.type };
    })
    .filter(Boolean);
}

/**
 * Drop orphan nodes with no incident edges (stale Url/Domain debris in Neo4j).
 * Campaign nodes are kept as the visual anchor even if edge collection missed one.
 */
function filterConnectedSubgraph(nodes, edges) {
  if (!nodes.length) {
    return { nodes: [], edges: [], droppedOrphanCount: 0 };
  }
  const connectedIds = new Set();
  edges.forEach((edge) => {
    connectedIds.add(edge.source);
    connectedIds.add(edge.target);
  });
  const kept = nodes.filter(
    (node) => connectedIds.has(node.id) || node.type === "Campaign"
  );
  const keptIds = new Set(kept.map((node) => node.id));
  const keptEdges = edges.filter(
    (edge) => keptIds.has(edge.source) && keptIds.has(edge.target)
  );
  return {
    nodes: kept,
    edges: keptEdges,
    droppedOrphanCount: nodes.length - kept.length,
  };
}

/** Fetch a bounded subgraph around one review for analyst drill-down. */
async function getReviewNeighborhood(reviewId, depth = 2) {
  // depth is capped by the API (max 4) before interpolation — avoids unbounded Cypher cost.
  const rows = await runRead(
    `
    MATCH (r:Review {id: $reviewId})
    OPTIONAL MATCH path = (r)-[*1..${Number(depth)}]-(n)
    WITH collect(DISTINCT r) + collect(DISTINCT n) AS nodes,
         collect(DISTINCT path) AS paths
    UNWIND nodes AS node
    WITH collect(DISTINCT node) AS allNodes, paths
    UNWIND paths AS p
    UNWIND relationships(p) AS rel
    WITH allNodes, collect(DISTINCT rel) AS allRels
    RETURN allNodes, allRels
    `,
    { reviewId }
  );

  if (!rows.length) {
    return { nodes: [], edges: [] };
  }

  const nodeRecords = rows[0].get("allNodes") || [];
  const relRecords = rows[0].get("allRels") || [];
  const nodes = nodeRecords.filter(Boolean).map((n) => nodeToJson(n));
  const edges = edgesFromNeo4j(nodeRecords, relRecords);

  return { nodes, edges };
}

/** Build a visualization payload: recent risky reviews + shared domains + campaigns. */
async function getVisualizationGraph(limit = 40) {
  const rows = await runRead(
    `
    MATCH (r:Review)
    WHERE r.verdict IN ['suspicious', 'likely_phishing'] OR r.status = 'completed'
    WITH r ORDER BY r.status DESC LIMIT $limit
    OPTIONAL MATCH (r)-[:CONTAINS_URL]->(u:Url)-[:RESOLVES_TO]->(d:Domain)
    OPTIONAL MATCH (r)-[:PART_OF_CAMPAIGN]->(c:Campaign)
    OPTIONAL MATCH (s:Sender)-[:SENT]->(r)
    RETURN collect(DISTINCT r) AS reviews,
           collect(DISTINCT s) AS senders,
           collect(DISTINCT u) AS urls,
           collect(DISTINCT d) AS domains,
           collect(DISTINCT c) AS campaigns
    `,
    { limit: Number(limit) }
  );

  if (!rows.length) {
    return { nodes: [], edges: [], stats: { reviewCount: 0, campaignCount: 0 } };
  }

  const reviews = rows[0].get("reviews") || [];
  const senders = rows[0].get("senders") || [];
  const urls = rows[0].get("urls") || [];
  const domains = rows[0].get("domains") || [];
  const campaigns = rows[0].get("campaigns") || [];

  const allNodes = [...senders, ...reviews, ...urls, ...domains, ...campaigns]
    .filter(Boolean)
    .map((n) => nodeToJson(n));

  const uniqueNodes = [];
  const seen = new Set();
  for (const node of allNodes) {
    if (seen.has(node.id)) {
      continue;
    }
    seen.add(node.id);
    uniqueNodes.push(node);
  }

  const edgeRows = await runRead(
    `
    MATCH (a)-[rel]->(b)
    WHERE (a:Review OR a:Sender OR a:Url OR a:Domain OR a:Campaign)
      AND (b:Review OR b:Sender OR b:Url OR b:Domain OR b:Campaign)
    RETURN a, rel, b
    LIMIT 200
    `
  );

  const nodeIds = new Set(uniqueNodes.map((n) => n.id));
  const edges = edgeRows
    .map((record) => {
      const source = nodeToJson(record.get("a")).id;
      const target = nodeToJson(record.get("b")).id;
      if (!nodeIds.has(source) || !nodeIds.has(target)) {
        return null;
      }
      return {
        source,
        target,
        label: record.get("rel").type,
      };
    })
    .filter(Boolean);

  return {
    nodes: uniqueNodes,
    edges,
    stats: {
      reviewCount: reviews.filter(Boolean).length,
      campaignCount: campaigns.filter(Boolean).length,
    },
  };
}

/**
 * Subgraph for one Campaign node and its linked senders, reviews, URLs, and domains.
 * Used by the React UI so analysts see one campaign at a time (avoids full-graph overload).
 */
async function getCampaignSubgraph(indicator) {
  const normalized = String(indicator || "").trim();
  if (!normalized) {
    return { nodes: [], edges: [], indicator: "", reviewCount: 0 };
  }

  const rows = await runRead(
    `
    MATCH (c:Campaign {indicator: $indicator})
    OPTIONAL MATCH (r:Review)-[:PART_OF_CAMPAIGN]->(c)
    OPTIONAL MATCH (s:Sender)-[:SENT]->(r)
    OPTIONAL MATCH (r)-[:CONTAINS_URL]->(u:Url)-[:RESOLVES_TO]->(d:Domain)
    WITH c,
         collect(DISTINCT r) AS reviews,
         collect(DISTINCT s) AS senders,
         collect(DISTINCT u) AS urls,
         collect(DISTINCT d) AS domains
    WITH [n IN (reviews + senders + urls + domains + [c]) WHERE n IS NOT NULL] AS rawNodes
    UNWIND rawNodes AS n
    WITH collect(DISTINCT n) AS nodes
    WHERE size(nodes) > 0
    MATCH (a)-[rel]-(b)
    WHERE a IN nodes AND b IN nodes AND id(a) < id(b)
    WITH nodes, collect(DISTINCT rel) AS rels, $indicator AS indicator,
         size([x IN nodes WHERE x:Review]) AS reviewCount
    RETURN nodes, rels, indicator, reviewCount
    `,
    { indicator: normalized }
  );

  if (!rows.length) {
    return { nodes: [], edges: [], indicator: normalized, reviewCount: 0 };
  }

  const record = rows[0];
  const nodeRecords = record.get("nodes") || [];
  const relRecords = record.get("rels") || [];
  const rawNodes = nodeRecords.filter(Boolean).map((n) => nodeToJson(n));
  const rawEdges = edgesFromNeo4j(nodeRecords, relRecords);
  const { nodes, edges, droppedOrphanCount } = filterConnectedSubgraph(rawNodes, rawEdges);

  return {
    nodes,
    edges,
    droppedOrphanCount,
    indicator: record.get("indicator") || normalized,
    reviewCount: Number(record.get("reviewCount") || 0),
  };
}

module.exports = {
  nodeToJson,
  edgesFromNeo4j,
  filterConnectedSubgraph,
  getReviewNeighborhood,
  getVisualizationGraph,
  getCampaignSubgraph,
};
