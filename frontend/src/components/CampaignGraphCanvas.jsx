/**
 * SVG renderer for one campaign subgraph — pan, zoom, resize, hover tooltips.
 * Technology: plain SVG + React pointer events (no D3) for a small bundle and testability.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GRAPH_CANVAS_WIDTH,
  GRAPH_CANVAS_HEIGHT,
  GRAPH_CANVAS_MIN_HEIGHT,
  GRAPH_CANVAS_MAX_HEIGHT,
  NODE_COLORS,
  layoutNodesOnCircle,
  describeNode,
  describeEdge,
} from "../lib/graphLayout";

/** Invisible wide stroke makes thin edges easier to hover. */
const EDGE_HIT_WIDTH = 12;
/** Visible relationship line width once edges resolve correctly from Neo4j. */
const EDGE_STROKE_WIDTH = 2;

/**
 * @param {object} props
 * @param {{nodes:object[], edges:object[]}} props.graph
 * @param {number} props.zoom — scale factor from parent toolbar (1 = default)
 */
export default function CampaignGraphCanvas({ graph, zoom = 1 }) {
  const [hover, setHover] = useState(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [canvasHeight, setCanvasHeight] = useState(GRAPH_CANVAS_HEIGHT);
  const dragPanRef = useRef(null);
  const resizeRef = useRef(null);
  const wrapRef = useRef(null);

  /** Re-center pan when the analyst switches campaigns (parent remounts via key). */
  useEffect(() => {
    setPan({ x: 0, y: 0 });
  }, [graph.indicator, graph.nodes?.length]);

  const positioned = useMemo(
    () => layoutNodesOnCircle(graph.nodes || [], GRAPH_CANVAS_WIDTH, canvasHeight),
    [graph.nodes, canvasHeight]
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

  const originX = GRAPH_CANVAS_WIDTH / 2;
  const originY = canvasHeight / 2;
  const transform = `translate(${pan.x} ${pan.y}) translate(${originX} ${originY}) scale(${zoom}) translate(${-originX} ${-originY})`;

  /** Drag background to pan — keeps zoomed subgraph in view without scrollbars. */
  const onPanPointerDown = (event) => {
    if (event.button !== 0) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragPanRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const onPanPointerMove = (event) => {
    if (!dragPanRef.current) {
      return;
    }
    const dx = event.clientX - dragPanRef.current.startX;
    const dy = event.clientY - dragPanRef.current.startY;
    setPan({
      x: dragPanRef.current.panX + dx,
      y: dragPanRef.current.panY + dy,
    });
  };

  const onPanPointerUp = (event) => {
    dragPanRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch (_err) {
      /* pointer already released */
    }
  };

  /** Bottom resize handle — adjusts SVG viewport height (stretch / contract). */
  const onResizePointerDown = useCallback((event) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = { startY: event.clientY, startHeight: canvasHeight };
  }, [canvasHeight]);

  const onResizePointerMove = useCallback((event) => {
    if (!resizeRef.current) {
      return;
    }
    const delta = event.clientY - resizeRef.current.startY;
    const next = Math.min(
      GRAPH_CANVAS_MAX_HEIGHT,
      Math.max(GRAPH_CANVAS_MIN_HEIGHT, resizeRef.current.startHeight + delta)
    );
    setCanvasHeight(next);
  }, []);

  const onResizePointerUp = (event) => {
    resizeRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch (_err) {
      /* ignore */
    }
  };

  return (
    <div className="graph-canvas-wrap" ref={wrapRef}>
      <svg
        className="graph-svg graph-svg--interactive"
        viewBox={`0 0 ${GRAPH_CANVAS_WIDTH} ${canvasHeight}`}
        style={{ height: canvasHeight }}
        role="img"
        aria-label="Campaign relationship graph"
        onMouseLeave={clearHover}
        onPointerDown={onPanPointerDown}
        onPointerMove={onPanPointerMove}
        onPointerUp={onPanPointerUp}
        onPointerCancel={onPanPointerUp}
      >
        <rect
          x="0"
          y="0"
          width={GRAPH_CANVAS_WIDTH}
          height={canvasHeight}
          fill="transparent"
          aria-hidden="true"
        />
        <g transform={transform}>
          {(graph.edges || []).map((edge, idx) => {
            const from = positionById.get(edge.source);
            const to = positionById.get(edge.target);
            if (!from || !to) {
              return null;
            }
            const edgeKey = `${edge.source}-${edge.target}-${idx}`;
            const highlighted = hover?.kind === "edge" && hover.edgeKey === edgeKey;
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
                  stroke={highlighted ? "#2f6fed" : "#555"}
                  strokeWidth={EDGE_STROKE_WIDTH}
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
              onPointerDown={(e) => e.stopPropagation()}
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
      <div
        className="graph-resize-handle"
        role="separator"
        aria-label="Resize graph height"
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
      />
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
      <p className="muted graph-canvas-hint">Drag the graph to pan · drag the bottom edge to resize</p>
    </div>
  );
}
