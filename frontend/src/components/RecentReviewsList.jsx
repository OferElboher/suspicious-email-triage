/**
 * Review queue list — primary dashboard surface for tracking received analysis requests.
 *
 * Pattern: paginated GET /reviews; row click selects review for ReviewDetailPanel (no inline expand).
 * Technology: MongoDB-backed list with optional dev_simulation filter.
 */
import { useState } from "react";
import HoverHelp from "./HoverHelp";
import { effectiveVerdict, hasOverride } from "../lib/effectiveVerdict";

/**
 * @param {object} props
 * @param {object[]} props.reviews — current page rows from GET /reviews
 * @param {string|null} props.selectedReviewId — highlights row linked to detail panel
 * @param {(reviewId: string) => void} props.onSelectReview — load detail panel
 */
function ReviewRow({ summary, selected, onSelect }) {
  return (
    <li className={`dashboard-list-item${selected ? " dashboard-list-item--selected" : ""}`}>
      <button
        type="button"
        className="review-row-toggle"
        aria-current={selected ? "true" : undefined}
        onClick={() => onSelect(summary._id)}
      >
        <strong>
          {summary.source === "dev_simulation" ? "[Simulation] " : ""}
          {summary.subject}
        </strong>
        <div className="muted">
          {summary.senderEmail} · {summary.status} ·{" "}
          {summary.effectiveVerdict || effectiveVerdict(summary)}
          {hasOverride(summary) ? " · override" : ""}
        </div>
      </button>
    </li>
  );
}

/** Paginated review queue with date jump and simulation filter. */
export default function RecentReviewsList({
  reviews,
  page,
  lastPage,
  hasMore,
  totalReviews,
  onRefresh,
  onPageChange,
  onJumpToDate,
  selectedReviewId,
  onSelectReview,
  includeSimulation,
  onIncludeSimulationChange,
}) {
  const [jumpDate, setJumpDate] = useState("");
  const [jumpMessage, setJumpMessage] = useState("");

  return (
    <section className="card review-queue-panel">
      <HoverHelp text="Inbound and completed email reviews newest-first. Click a row to open analysis detail.">
        <h2>Review queue</h2>
      </HoverHelp>

      <div className="toolbar review-queue-panel__toolbar">
        <HoverHelp text="Include synthetic dev_simulation rows (hidden by default).">
          <label className="field field--checkbox">
            <input
              type="checkbox"
              checked={Boolean(includeSimulation)}
              onChange={(e) => onIncludeSimulationChange?.(e.target.checked)}
            />
            Show simulation traffic
          </label>
        </HoverHelp>
        <HoverHelp text="Reload the current page from the API.">
          <button type="button" onClick={onRefresh}>
            Refresh
          </button>
        </HoverHelp>
        <HoverHelp text="Jump to the first page of results.">
          <button type="button" disabled={page === 0} onClick={() => onPageChange(0)}>
            First
          </button>
        </HoverHelp>
        <HoverHelp text="Previous page of reviews.">
          <button
            type="button"
            disabled={page === 0}
            onClick={() => onPageChange(Math.max(page - 1, 0))}
          >
            Prev
          </button>
        </HoverHelp>
        <HoverHelp text="Next page when more reviews exist.">
          <button type="button" disabled={!hasMore} onClick={() => onPageChange(page + 1)}>
            Next
          </button>
        </HoverHelp>
        <HoverHelp text="Jump to the last page.">
          <button type="button" disabled={page >= lastPage} onClick={() => onPageChange(lastPage)}>
            Last
          </button>
        </HoverHelp>
        <HoverHelp text="Open the page containing the first review on the chosen UTC date.">
          <label className="field field--inline-date">
            Jump to date
            <input type="date" value={jumpDate} onChange={(e) => setJumpDate(e.target.value)} />
          </label>
        </HoverHelp>
        <HoverHelp text="Navigate pagination to the selected calendar day.">
          <button
            type="button"
            disabled={!jumpDate}
            onClick={() => {
              setJumpMessage("");
              Promise.resolve(onJumpToDate?.(jumpDate))
                .then((result) => {
                  if (result?.message) {
                    setJumpMessage(result.message);
                  }
                })
                .catch((err) => {
                  setJumpMessage(err.message || "No reviews on that date.");
                });
            }}
          >
            Go
          </button>
        </HoverHelp>
        <span className="muted">
          Page {page + 1}
          {totalReviews > 0 ? ` of ${lastPage + 1}` : ""}
        </span>
      </div>

      {jumpMessage && <p className="muted">{jumpMessage}</p>}

      <ul className="dashboard-list">
        {reviews.map((row) => (
          <ReviewRow
            key={row._id}
            summary={row}
            selected={String(selectedReviewId) === String(row._id)}
            onSelect={onSelectReview}
          />
        ))}
      </ul>
    </section>
  );
}
