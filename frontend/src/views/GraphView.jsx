/**
 * Phishing relationship graph view — fetches Neo4j visualization JSON and renders SVG.
 * Uses a simple circular layout (no external graph library) to keep the bundle small.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { getJson } from "../api/client";

/** Color map by node label type for quick visual scanning. */
const NODE_COLORS = {
  Sender: "#4f8cff",
  Review: "#ffb347",
  Url: "#ff6b6b",
  Domain: "#c44dff",
  Campaign: "#2ecc71",
  Unknown: "#888",
};

/** Place nodes on a circle; edges are straight lines between computed positions. */
function layoutNodes(nodes, width, height) {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.35;
  return nodes.map((node, index) => {
    const angle = (2 * Math.PI * index) / Math.max(nodes.length, 1);
    return {
      ...node,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });
}

/** Primary graph screen: campaigns list + SVG visualization panel. */
export default function GraphView() {
  const [graph, setGraph] = useState({ nodes: [], edges: [], stats: {} });
  const [campaigns, setCampaigns] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  /** Load visualization + campaign list; tolerate partial failure so one bad query does not blank the whole page. */
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [vizResult, campResult] = await Promise.allSettled([
        getJson("/graph/visualization"),
        getJson("/graph/campaigns"),
      ]);

      if (vizResult.status === "fulfilled") {
        setGraph(vizResult.value);
      } else {
        setGraph({ nodes: [], edges: [], stats: {} });
      }

      if (campResult.status === "fulfilled") {
        setCampaigns(campResult.value.campaigns || []);
      } else {
        setCampaigns([]);
      }

      const failures = [vizResult, campResult].filter((r) => r.status === "rejected");
      if (failures.length === 2) {
        const msg = failures[0].reason?.message || "Failed to load graph";
        setError(
          msg === "graph_campaigns_failed"
            ? "Graph data is unavailable. Verify Neo4j connectivity and API health."
            : msg
        );
      } else if (failures.length === 1) {
        const partial = failures[0].reason?.message || "partial load failed";
        setError(
          partial === "graph_campaigns_failed"
            ? "Campaign list could not be loaded. Visualization may still be available."
            : `Partial load: ${partial}`
        );
      }
    } catch (err) {
      setError(err.message || "Failed to load graph");
      setGraph({ nodes: [], edges: [], stats: {} });
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const width = 720;
  const height = 420;
  const positioned = useMemo(
    () => layoutNodes(graph.nodes || [], width, height),
    [graph.nodes, width, height]
  );
  const positionById = useMemo(() => {
    const map = new Map();
    positioned.forEach((n) => map.set(n.id, n));
    return map;
  }, [positioned]);

  return (
    <div className="graph-layout">
      <section className="card">
        <div className="toolbar">
          <h2 style={{ margin: 0 }}>Phishing relationship graph</h2>
          <button type="button" onClick={() => refresh().catch(() => {})}>
            Refresh
          </button>
        </div>
        <p className="muted">
          Relationship graph of senders, reviews, URLs, domains, and shared-indicator campaigns.
        </p>
        {loading && <p className="muted">Loading graph…</p>}
        {error && <p className="status-failed">{error}</p>}
        {!loading && !error && (
          <>
            <p className="muted">
              Reviews in view: {graph.stats?.reviewCount ?? 0} · Campaigns:{" "}
              {graph.stats?.campaignCount ?? 0}
            </p>
            <svg
              className="graph-svg"
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-label="Phishing activity graph"
            >
              {(graph.edges || []).map((edge, idx) => {
                const from = positionById.get(edge.source);
                const to = positionById.get(edge.target);
                if (!from || !to) {
                  return null;
                }
                return (
                  <line
                    key={`${edge.source}-${edge.target}-${idx}`}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke="#555"
                    strokeWidth="1"
                  />
                );
              })}
              {positioned.map((node) => (
                <g key={node.id}>
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r="14"
                    fill={NODE_COLORS[node.type] || NODE_COLORS.Unknown}
                  />
                  <text x={node.x} y={node.y + 28} textAnchor="middle" className="graph-label">
                    {node.label.length > 28 ? `${node.label.slice(0, 25)}…` : node.label}
                  </text>
                </g>
              ))}
            </svg>
          </>
        )}
      </section>

      <section className="card">
        <h2>Detected campaigns (shared indicators)</h2>
        {campaigns.length === 0 && !loading && (
          <p className="muted">No campaigns detected.</p>
        )}
        <ul className="dashboard-list">
          {campaigns.map((c) => (
            <li key={c.indicator}>
              <strong>{c.indicator}</strong>
              <div className="muted">
                {c.kind} · {c.reviewCount} linked review(s)
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
