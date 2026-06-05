/**
 * Recent reviews list with click-to-expand full detail (for graph queries and audit).
 */
import { useCallback, useState } from "react";
import { getJson } from "../api/client";

/** Format ISO timestamp for display in the expanded panel. */
function formatWhen(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch (_err) {
    return String(iso);
  }
}

/** Single row: collapsed summary or expanded full document. */
function ReviewRow({ summary, expanded, onToggle, canReadGraph }) {
  const id = summary._id;
  const isOpen = expanded?._id === id;

  return (
    <li className={`dashboard-list-item${isOpen ? " expanded" : ""}`}>
      <button type="button" className="review-row-toggle" onClick={() => onToggle(id)}>
        <strong>
          {summary.source === "dev_simulation" ? "[Simulation] " : ""}
          {summary.subject}
        </strong>
        <div className="muted">
          {summary.senderEmail} · {summary.status} · {summary.analysisResult?.verdict || "—"}
        </div>
      </button>
      {isOpen && expanded && (
        <div className="review-expanded panel">
          <p>
            <span className="muted">Review ID (MongoDB):</span>{" "}
            <code>{expanded._id}</code>
          </p>
          <p>
            <span className="muted">Updated:</span> {formatWhen(expanded.updatedAt)}
          </p>
          <p>
            <span className="muted">Sender:</span> {expanded.senderName} &lt;{expanded.senderEmail}
            &gt;
          </p>
          <p>
            <span className="muted">Subject:</span> {expanded.subject}
          </p>
          <pre className="review-body-preview">{expanded.body}</pre>
          {Array.isArray(expanded.links) && expanded.links.length > 0 && (
            <>
              <p className="muted">Extracted links</p>
              <ul className="findings">
                {expanded.links.map((href) => (
                  <li key={href}>
                    <code>{href}</code>
                  </li>
                ))}
              </ul>
            </>
          )}
          {expanded.analysisResult && (
            <>
              <p className="muted">Analysis</p>
              <p>
                Verdict: <strong>{expanded.analysisResult.verdict}</strong> · Action:{" "}
                {expanded.analysisResult.recommendedAction}
              </p>
              <p>{expanded.analysisResult.summary}</p>
            </>
          )}
          {canReadGraph && (
            <p className="muted">
              Neo4j: use review ID in Browser —{" "}
              <code>{`MATCH (r:Review {id: '${expanded._id}'})-[*1..3]-(n) RETURN r, n LIMIT 50`}</code>
            </p>
          )}
        </div>
      )}
    </li>
  );
}

/** Paginated recent reviews with expand/collapse per row. */
export default function RecentReviewsList({
  reviews,
  page,
  lastPage,
  hasMore,
  totalReviews,
  onRefresh,
  onPageChange,
  canReadGraph,
  includeSimulation,
  onIncludeSimulationChange,
}) {
  const [expanded, setExpanded] = useState(null);
  const [loadingId, setLoadingId] = useState(null);

  /** Toggle: collapse if same id, else fetch full document from GET /reviews/:id. */
  const handleToggle = useCallback(
    async (reviewId) => {
      if (expanded?._id === reviewId) {
        setExpanded(null);
        return;
      }
      setLoadingId(reviewId);
      try {
        const doc = await getJson(`/reviews/${reviewId}`);
        setExpanded(doc);
      } catch (_err) {
        setExpanded(null);
      } finally {
        setLoadingId(null);
      }
    },
    [expanded]
  );

  return (
    <section className="card" style={{ gridColumn: "1 / -1" }}>
      <h2>Recent reviews</h2>
      <p className="muted">
        Shows analyst-submitted reviews by default. Dev simulation traffic is hidden unless you
        enable it below (synthetic &quot;Simulated ingest&quot; rows).
      </p>
      <div className="toolbar">
        <label className="field" style={{ marginBottom: 0 }}>
          <input
            type="checkbox"
            checked={Boolean(includeSimulation)}
            onChange={(e) => onIncludeSimulationChange?.(e.target.checked)}
          />{" "}
          Show simulation traffic
        </label>
        <button type="button" onClick={onRefresh}>
          Refresh
        </button>
        <button type="button" disabled={page === 0} onClick={() => onPageChange(0)}>
          First
        </button>
        <button type="button" disabled={page === 0} onClick={() => onPageChange(Math.max(page - 1, 0))}>
          Prev
        </button>
        <button type="button" disabled={!hasMore} onClick={() => onPageChange(page + 1)}>
          Next
        </button>
        <button type="button" disabled={page >= lastPage} onClick={() => onPageChange(lastPage)}>
          Last
        </button>
        <span className="muted">
          Page {page + 1}
          {totalReviews > 0 ? ` of ${lastPage + 1}` : ""}
        </span>
      </div>
      {loadingId && <p className="muted">Loading review details…</p>}
      <ul className="dashboard-list">
        {reviews.map((r) => (
          <ReviewRow
            key={r._id}
            summary={r}
            expanded={expanded}
            onToggle={handleToggle}
            canReadGraph={canReadGraph}
          />
        ))}
      </ul>
    </section>
  );
}
