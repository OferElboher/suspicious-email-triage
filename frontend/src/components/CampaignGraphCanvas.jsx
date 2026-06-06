/**
 * SVG renderer for one campaign subgraph — zoom transform, hover tooltips on nodes/edges.
 * Technology: plain SVG + React state (no graph library) for maintainability and small bundle.
 */
import { useMemo, useState } from "react";
import {
  GRAPH_CANVAS_WIDTH,
  GRAPH_CANVAS_HEIGHT,
  NODE_COLORS,
  layoutNodesOnCircle,
  describeNode,
  describeEdge,
} from "../lib/graphLayout";

/** Invisible wide stroke makes thin edges easier to hover. */
const EDGE_HIT_WIDTH = 10;

/**
 * @param {object} props
 * @param {{nodes:object[], edges:object[]}} props.graph
 * @param {number} props.zoom — SVG scale factor (1 = default)
 */
export default function CampaignGraphCanvas({ graph, zoom = 1 }) {
  const [hover, setHover] = useState(null);

  const positioned = useMemo(
    () => layoutNodesOnCircle(graph.nodes || []),
    [graph.nodes]
  );

  const positionById = useMemo(() => {
    const map = new Map();
    positioned.forEach((n) => map.set(n.id, n));
    return map;
  }, [positioned]);

  const handleNodeEnter = (node) => (event) => {
    setHover({
      kind: "node",
      nodeId: node.id,
      text: describeNode(node),
      x: event.clientX,
      y: event.clientY,
    });
  };

  const handleEdgeEnter = (edge, edgeKey) => (event) => {
    setHover({
      kind: "edge",
      edgeKey,
      text: describeEdge(edge),
      x: event.clientX,
      y: event.clientY,
    });
  };

  const clearHover = () => setHover(null);

  const transform = `scale(${zoom})`;
  const originX = GRAPH_CANVAS_WIDTH / 2;
  const originY = GRAPH_CANVAS_HEIGHT / 2;

  return (
    <div className="graph-canvas-wrap">
      <svg
        className="graph-svg"
        viewBox={`0 0 ${GRAPH_CANVAS_WIDTH} ${GRAPH_CANVAS_HEIGHT}`}
        role="img"
        aria-label="Campaign relationship graph"
        onMouseLeave={clearHover}
      >
        <g transform={`translate(${originX} ${originY}) ${transform} translate(${-originX} ${-originY})`}>
          {(graph.edges || []).map((edge, idx) => {
            const from = positionById.get(edge.source);
            const to = positionById.get(edge.target);
            if (!from || !to) {
              return null;
            }
            const edgeKey = `${edge.source}-${edge.target}-${idx}`;
            return (
              <g key={edgeKey}>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke="transparent"
                  strokeWidth={EDGE_HIT_WIDTH}
                  onMouseEnter={handleEdgeEnter(edge, edgeKey)}
                  onMouseMove={handleEdgeEnter(edge, edgeKey)}
                  onMouseLeave={clearHover}
                />
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={hover?.kind === "edge" && hover.edgeKey === edgeKey ? "#2f6fed" : "#666"}
                  strokeWidth="1.5"
                  pointerEvents="none"
                />
                <title>{describeEdge(edge)}</title>
              </g>
            );
          })}
          {positioned.map((node) => (
            <g
              key={node.id}
              onMouseEnter={handleNodeEnter(node)}
              onMouseMove={handleNodeEnter(node)}
              onMouseLeave={clearHover}
              style={{ cursor: "pointer" }}
            >
              <circle
                cx={node.x}
                cy={node.y}
                r="16"
                fill={NODE_COLORS[node.type] || NODE_COLORS.Unknown}
                stroke={hover?.kind === "node" && hover.nodeId === node.id ? "#1a1a1a" : "none"}
                strokeWidth="2"
              />
              <text x={node.x} y={node.y + 30} textAnchor="middle" className="graph-label">
                {node.label.length > 24 ? `${node.label.slice(0, 21)}…` : node.label}
              </text>
              <title>{describeNode(node)}</title>
            </g>
          ))}
        </g>
      </svg>
      {hover && (
        <div
          className="graph-tooltip"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
          role="tooltip"
        >
          {hover.text.split("\n").map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}
