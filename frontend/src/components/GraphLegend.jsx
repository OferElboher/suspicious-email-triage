/** Color legend for Neo4j node types on the phishing graph canvas. */
import { NODE_COLORS } from "../lib/graphLayout";

/** Human-readable labels for each graph node type (matches NODE_COLORS keys). */
const NODE_LABELS = {
  Sender: "Email sender",
  Review: "Review record",
  Url: "Link URL",
  Domain: "Link domain",
  Campaign: "Phishing campaign cluster",
  Unknown: "Unclassified node",
};

/**
 * Renders a horizontal legend below the SVG graph (spatial layout has no X/Y axes).
 * Pattern: design-token colors from graphLayout.js keep legend in sync with node fill.
 */
export default function GraphLegend() {
  return (
    <div className="graph-legend" role="list" aria-label="Graph node type legend">
      {Object.entries(NODE_COLORS).map(([type, color]) => (
        <span key={type} className="graph-legend__item" role="listitem">
          <span className="graph-legend__swatch" style={{ background: color }} aria-hidden="true" />
          <span className="graph-legend__label">
            <strong>{type}</strong>
            <span className="muted"> — {NODE_LABELS[type] || type}</span>
          </span>
        </span>
      ))}
    </div>
  );
}
