/**
 * SVG renderer for one campaign subgraph — pan, zoom, resize (width + height), hover tooltips.
 *
 * The Phishing graph tab loads nodes and edges from Neo4j for a single campaign. This component
 * draws that subgraph as circles and lines, lets the analyst drag the view to pan, and offers
 * resize handles so a dense campaign can use more screen space. Zoom scale comes from the parent
 * toolbar; this file applies it around the center of the canvas.
 *
 * Technology: plain SVG + React pointer events (no D3) for a small bundle and straightforward tests.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  GRAPH_CANVAS_WIDTH,
  GRAPH_CANVAS_HEIGHT,
  GRAPH_CANVAS_MIN_HEIGHT,
  GRAPH_CANVAS_MAX_HEIGHT,
  GRAPH_CANVAS_MIN_WIDTH,
  GRAPH_CANVAS_MAX_WIDTH,
  NODE_COLORS,
  layoutNodesOnCircle,
  filterToPrimaryComponent,
  describeNode,
  describeEdge,
} from "../lib/graphLayout";

/**
 * Width of the invisible line drawn on top of each relationship. The visible stroke is only 2px,
 * which is hard to hover with a mouse; this wider transparent stroke catches pointer events first.
 */
const EDGE_HIT_WIDTH = 12;

/**
 * Width of the visible relationship line (pixels). Shown in the graph color unless the edge is
 * highlighted because the analyst is hovering it.
 */
const EDGE_STROKE_WIDTH = 2;

/**
 * @param {object} props
 * @param {{nodes:object[], edges:object[], droppedOrphanCount?:number, indicator?:string}} props.graph
 *   Neo4j subgraph for one campaign: nodes (Sender, Review, Url, …), edges between them, optional
 *   count of nodes dropped as orphans, and campaign indicator string used to reset pan on switch.
 * @param {number} props.zoom — scale factor from parent toolbar (1 = default, clamped in parent)
 */
export default function CampaignGraphCanvas({ graph, zoom = 1 }) {
  /**
   * What the analyst is hovering: either a node or an edge, plus screen coordinates for the
   * floating tooltip and the preformatted multi-line description text.
   */
  const [hover, setHover] = useState(null);

  /**
   * How far the entire graph group has been dragged from its default centered position (pixels).
   * Updated while dragging the SVG background; reset when the campaign changes.
   */
  const [pan, setPan] = useState({ x: 0, y: 0 });

  /**
   * Current drawable width of the SVG viewport. Starts at the layout default; the user can
   * drag the east resize handle to widen the canvas within min/max bounds from graphLayout.
   */
  const [canvasWidth, setCanvasWidth] = useState(GRAPH_CANVAS_WIDTH);

  /**
   * Current drawable height of the SVG viewport. Same idea as canvasWidth but controlled by
   * the south resize handle at the bottom of the graph wrapper.
   */
  const [canvasHeight, setCanvasHeight] = useState(GRAPH_CANVAS_HEIGHT);

  /**
   * While the user drags the background to pan, we store pointer-down position and pan offset
   * here so move events can compute delta without re-rendering on every pixel (ref avoids stale
   * closure issues with the latest pan state).
   */
  const dragPanRef = useRef(null);

  /**
   * Active vertical resize gesture: starting mouse Y and canvas height when the south handle
   * was pressed. Null when not resizing.
   */
  const resizeHeightRef = useRef(null);

  /**
   * Active horizontal resize gesture: starting mouse X and canvas width when the east handle
   * was pressed. Null when not resizing.
   */
  const resizeWidthRef = useRef(null);

  /** Copy hover detail text to the clipboard (browser API; used from the tooltip action row). */
  const copyHoverDetail = useCallback(async () => {
    if (!hover?.text) {
      return;
    }
    try {
      await navigator.clipboard.writeText(hover.text);
    } catch {
      /* Clipboard may be denied outside secure context — save-to-file still works. */
    }
  }, [hover]);

  /** Download hover detail as a plain-text file for tickets or runbooks. */
  const saveHoverDetail = useCallback(() => {
    if (!hover?.text) {
      return;
    }
    const blob = new Blob([hover.text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `graph-detail-${Date.now()}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [hover]);

  /**
   * When the parent switches to another campaign (different indicator or node count), snap pan
   * back to center so the new subgraph is not still offset from the previous drag.
   */
  useEffect(() => {
    setPan({ x: 0, y: 0 });
  }, [graph.indicator, graph.nodes?.length]);

  /**
   * Nodes and edges actually drawn. The API usually returns one connected component, but cached
   * or partial data can include stray nodes. We keep only the piece reachable from the Campaign
   * node so the circle layout and edges stay coherent.
   */
  const displayGraph = useMemo(() => {
    const campaignAnchor =
      (graph.nodes || []).find((node) => node.type === "Campaign")?.id || null;
    return filterToPrimaryComponent(graph.nodes || [], graph.edges || [], campaignAnchor);
  }, [graph.nodes, graph.edges]);

  /**
   * Screen positions for every node before we draw circles and edges. layoutNodesOnCircle (in
   * graphLayout.js) spreads nodes evenly around the center of the current canvas — like placing
   * chairs around a table — so a typical campaign (senders, reviews, URLs, one Campaign node)
   * stays readable without a heavy graph layout library. Output is the same node objects plus
   * numeric x/y in SVG space; recomputed when the filtered node list or canvas size changes.
   */
  const positioned = useMemo(
    () => layoutNodesOnCircle(displayGraph.nodes, canvasWidth, canvasHeight),
    [displayGraph.nodes, canvasWidth, canvasHeight]
  );

  /**
   * Fast lookup from node id to { x, y, label, type, … } so edge rendering can find both
   * endpoints without scanning the positioned array for every line.
   */
  const positionById = useMemo(() => {
    const map = new Map();
    positioned.forEach((n) => map.set(n.id, n));
    return map;
  }, [positioned]);

  /**
   * Returns a mouse-enter/move handler for one node. Sets hover state with a full tooltip
   * string from describeNode and tracks cursor position for the floating div.
   */
  const handleNodeEnter = (node) => (event) => {
    setHover({
      kind: "node",
      nodeId: node.id,
      text: describeNode(node),
      x: event.clientX,
      y: event.clientY,
    });
  };

  /**
   * Returns a mouse-enter/move handler for one edge. edgeKey disambiguates parallel edges in
   * the highlight check when several relationships share the same source/target pair.
   */
  const handleEdgeEnter = (edge, edgeKey) => (event) => {
    setHover({
      kind: "edge",
      edgeKey,
      text: describeEdge(edge),
      x: event.clientX,
      y: event.clientY,
    });
  };

  /** Clears the tooltip when the pointer leaves a node, edge, or the SVG. */
  const clearHover = () => setHover(null);

  /** Horizontal center of the SVG — used as the fixed point for zoom scaling. */
  const originX = canvasWidth / 2;

  /** Vertical center of the SVG — paired with originX for zoom-about-center math. */
  const originY = canvasHeight / 2;

  /**
   * SVG transform applied to the group containing all nodes and edges: user pan, then translate
   * to center, scale by toolbar zoom, translate back so zoom feels anchored to the middle of
   * the canvas rather than the top-left corner.
   */
  const transform = `translate(${pan.x} ${pan.y}) translate(${originX} ${originY}) scale(${zoom}) translate(${-originX} ${-originY})`;

  /**
   * Pointer down on the SVG background (left button only). Captures the pointer so move/up
   * events stay on this element even if the cursor leaves the svg bounds while dragging.
   */
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

  /**
   * While dragPanRef is set, move the pan offset by the distance the pointer moved since
   * pointer down, added to the pan values stored at drag start.
   */
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

  /**
   * End pan drag: drop the ref and release pointer capture. Ignore errors if capture was
   * already released (e.g. pointer cancel).
   */
  const onPanPointerUp = (event) => {
    dragPanRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch (_err) {
      /* pointer already released */
    }
  };

  /**
   * Start dragging the bottom (south) resize handle. preventDefault/stopPropagation keep the
   * event from also starting a background pan on the SVG underneath.
   */
  const onResizeHeightPointerDown = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeHeightRef.current = { startY: event.clientY, startHeight: canvasHeight };
  }, [canvasHeight]);

  /**
   * Adjust canvas height by vertical pointer delta, clamped to GRAPH_CANVAS_MIN_HEIGHT and
   * GRAPH_CANVAS_MAX_HEIGHT so the graph cannot be resized unusably small or huge.
   */
  const onResizeHeightPointerMove = useCallback((event) => {
    if (!resizeHeightRef.current) {
      return;
    }
    const delta = event.clientY - resizeHeightRef.current.startY;
    const next = Math.min(
      GRAPH_CANVAS_MAX_HEIGHT,
      Math.max(GRAPH_CANVAS_MIN_HEIGHT, resizeHeightRef.current.startHeight + delta)
    );
    setCanvasHeight(next);
  }, []);

  /**
   * Start dragging the right (east) resize handle to change canvas width; same capture pattern
   * as the height handle.
   */
  const onResizeWidthPointerDown = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeWidthRef.current = { startX: event.clientX, startWidth: canvasWidth };
  }, [canvasWidth]);

  /**
   * Adjust canvas width by horizontal pointer delta, clamped to layout min/max width constants.
   */
  const onResizeWidthPointerMove = useCallback((event) => {
    if (!resizeWidthRef.current) {
      return;
    }
    const delta = event.clientX - resizeWidthRef.current.startX;
    const next = Math.min(
      GRAPH_CANVAS_MAX_WIDTH,
      Math.max(GRAPH_CANVAS_MIN_WIDTH, resizeWidthRef.current.startWidth + delta)
    );
    setCanvasWidth(next);
  }, []);

  /**
   * Shared cleanup for width or height resize: clear the given ref and release pointer capture.
   */
  const releaseResize = (event, ref) => {
    ref.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch (_err) {
      /* ignore */
    }
  };

  /**
   * Optional footnote shown under the graph when the backend or client-side filter removed nodes
   * that were not connected to the campaign — explains why the count might look smaller than expected.
   */
  const orphanNote =
    (graph.droppedOrphanCount || 0) > 0 || displayGraph.droppedOrphanCount > 0
      ? " Unconnected nodes were hidden (stale graph data or missing relationships)."
      : "";

  return (
    <div className="graph-canvas-wrap" style={{ width: canvasWidth, maxWidth: "100%" }}>
      <svg
        className="graph-svg graph-svg--interactive"
        viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
        style={{ width: canvasWidth, height: canvasHeight, maxWidth: "100%" }}
        role="img"
        aria-label="Campaign relationship graph"
        onMouseLeave={clearHover}
        onPointerDown={onPanPointerDown}
        onPointerMove={onPanPointerMove}
        onPointerUp={onPanPointerUp}
        onPointerCancel={onPanPointerUp}
      >
        {/* Full-size transparent rect so pointer events hit the entire canvas for panning. */}
        <rect
          x="0"
          y="0"
          width={canvasWidth}
          height={canvasHeight}
          fill="transparent"
          aria-hidden="true"
        />
        <g transform={transform}>
          {displayGraph.edges.map((edge, idx) => {
            /** Layout coordinates for the relationship's start node; skip edge if missing. */
            const from = positionById.get(edge.source);
            /** Layout coordinates for the relationship's end node. */
            const to = positionById.get(edge.target);
            if (!from || !to) {
              return null;
            }
            /** Stable React key and hover id — includes index in case duplicate pairs exist. */
            const edgeKey = `${edge.source}-${edge.target}-${idx}`;
            /** True when the floating tooltip is currently describing this edge. */
            const highlighted = hover?.kind === "edge" && hover.edgeKey === edgeKey;
            return (
              <g key={edgeKey}>
                {/* Wide invisible stroke — target for mouse hover to show edge tooltip. */}
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
                {/* Visible edge; pointerEvents none so hover goes to the hit line above. */}
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
      {/* East handle: drag right edge to change canvasWidth. */}
      <div
        className="graph-resize-handle graph-resize-handle--east"
        role="separator"
        aria-label="Resize graph width"
        onPointerDown={onResizeWidthPointerDown}
        onPointerMove={onResizeWidthPointerMove}
        onPointerUp={(e) => releaseResize(e, resizeWidthRef)}
        onPointerCancel={(e) => releaseResize(e, resizeWidthRef)}
      />
      {/* South handle: drag bottom edge to change canvasHeight. */}
      <div
        className="graph-resize-handle graph-resize-handle--south"
        role="separator"
        aria-label="Resize graph height"
        onPointerDown={onResizeHeightPointerDown}
        onPointerMove={onResizeHeightPointerMove}
        onPointerUp={(e) => releaseResize(e, resizeHeightRef)}
        onPointerCancel={(e) => releaseResize(e, resizeHeightRef)}
      />
      {hover && (
        <div
          className="graph-tooltip graph-tooltip--with-actions"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
          role="tooltip"
        >
          {hover.text.split("\n").map((line) => (
            <div key={line}>{line}</div>
          ))}
          <div className="graph-tooltip-actions">
            <button type="button" className="graph-tooltip-btn" onClick={() => copyHoverDetail()}>
              Copy
            </button>
            <button type="button" className="graph-tooltip-btn" onClick={() => saveHoverDetail()}>
              Save to file
            </button>
          </div>
        </div>
      )}
      {orphanNote ? (
        <p className="muted graph-canvas-hint graph-canvas-hint--orphans">{orphanNote}</p>
      ) : null}
    </div>
  );
}
