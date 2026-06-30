/**
 * Analyst full-text search over past reviews (Elasticsearch index).
 *
 * Pattern: React controlled form → GET /search/reviews with offset pagination (same toolbar
 * as Review queue: First, Prev, Next, Last, Refresh, Jump to date).
 * Technology: Elasticsearch multi_match + bool filters; GET /search/page-for-date for date jump.
 *
 * @param {object} [props]
 * @param {boolean} [props.standalone] — full-width layout on dedicated #search tab
 */
import { useCallback, useState } from "react";
import { getJson } from "../api/client";
import HoverHelp from "./HoverHelp";

/** Page size — matches review queue (TriageApp PAGE_SIZE) and backend DEFAULT_SEARCH_PAGE_SIZE. */
const PAGE_SIZE = 20;

/** Example plain-language questions analysts can paste into the Keywords field. */
const EXAMPLE_QUERIES = [
  "verify your account password",
  "urgent wire transfer",
  "example-phish suspicious link",
  "microsoft login reset",
];

/** Search form + paginated results table for indexed review documents. */
export default function ReviewSearchPanel({ standalone = false }) {
  const [query, setQuery] = useState("");
  const [verdict, setVerdict] = useState("");
  const [status, setStatus] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [updatedFrom, setUpdatedFrom] = useState("");
  const [updatedTo, setUpdatedTo] = useState("");
  const [subjectRegex, setSubjectRegex] = useState("");
  const [bodyRegex, setBodyRegex] = useState("");
  const [hits, setHits] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [jumpDate, setJumpDate] = useState("");
  const [jumpMessage, setJumpMessage] = useState("");

  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  /** Serialize current filter state into URLSearchParams (shared by search + page-for-date). */
  const buildFilterParams = useCallback(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (verdict) params.set("verdict", verdict);
    if (status) params.set("status", status);
    if (senderEmail.trim()) params.set("senderEmail", senderEmail.trim());
    if (updatedFrom) params.set("updatedFrom", `${updatedFrom}T00:00:00Z`);
    if (updatedTo) params.set("updatedTo", `${updatedTo}T23:59:59Z`);
    if (subjectRegex.trim()) params.set("subjectRegex", subjectRegex.trim());
    if (bodyRegex.trim()) params.set("bodyRegex", bodyRegex.trim());
    params.set("limit", String(PAGE_SIZE));
    return params;
  }, [query, verdict, status, senderEmail, updatedFrom, updatedTo, subjectRegex, bodyRegex]);

  /**
   * Fetch one page of search hits from GET /search/reviews (offset = page * PAGE_SIZE).
   * @param {number} targetPage — zero-based page index
   */
  const loadResults = useCallback(
    async (targetPage) => {
      setLoading(true);
      setError("");
      setJumpMessage("");
      try {
        const params = buildFilterParams();
        params.set("offset", String(targetPage * PAGE_SIZE));

        const data = await getJson(`/search/reviews?${params.toString()}`);
        if (!data.enabled) {
          setError(
            "Elasticsearch is disabled or unreachable. Open the Search past reviews tab after starting the elasticsearch Docker service (see docs/search_guide_elasticsearch_reviews.md)."
          );
          setHits([]);
          setTotal(0);
          setHasMore(false);
        } else {
          setHits(data.hits || []);
          setTotal(data.total || 0);
          setHasMore(Boolean(data.hasMore));
          setPage(targetPage);
        }
        setSearched(true);
      } catch (err) {
        setError(err.message || "Search failed");
        setHits([]);
        setTotal(0);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    },
    [buildFilterParams]
  );

  /** Run a new search from page 0 (Search reviews button or Enter in Keywords). */
  const runSearch = () => {
    loadResults(0).catch(() => {});
  };

  /** Re-fetch the current page with unchanged filters. */
  const refreshResults = () => {
    loadResults(page).catch(() => {});
  };

  /** Navigate to another results page (First / Prev / Next / Last). */
  const onPageChange = (newPage) => {
    loadResults(newPage).catch(() => {});
  };

  /**
   * Jump pagination to the page containing the first match on a calendar day (UTC).
   * Uses GET /search/page-for-date with the same filters as the active search.
   */
  const jumpToSearchDate = async (dateStr) => {
    setJumpMessage("");
    const params = buildFilterParams();
    params.set("date", dateStr);
    try {
      const data = await getJson(`/search/page-for-date?${params.toString()}`);
      await loadResults(data.page);
      setJumpMessage(`Page ${data.page + 1} — ${data.onDayCount} match(es) on ${data.date}.`);
    } catch (err) {
      if (err.body?.error === "no_reviews_on_date") {
        throw new Error(`No matching reviews on ${dateStr}.`);
      }
      throw err;
    }
  };

  /** Fill Keywords from a suggested plain-language example. */
  const applyExample = (text) => {
    setQuery(text);
  };

  return (
    <section
      className={`card${standalone ? " review-search-panel--standalone" : ""}`}
      style={{ gridColumn: "1 / -1" }}
    >
      <HoverHelp text="Full-text search over the Elasticsearch triage-reviews index. Type everyday language in Keywords — Elasticsearch matches important words across subject, body, sender, and links.">
        <h2>Search past reviews</h2>
      </HoverHelp>

      <p className="muted" style={{ fontSize: "0.9rem" }}>
        <strong>Plain-language search:</strong> type a question or phrase in{" "}
        <strong>Keywords</strong> — for example &quot;emails asking to reset my password&quot; or
        &quot;suspicious link verify account&quot;. Elasticsearch splits your text into words and
        finds reviews where those words appear in the subject, body, sender fields, or extracted
        URLs. Results are paginated (20 per page) with the same navigation controls as the review
        queue.
      </p>

      <div className="search-example-chips" role="list" aria-label="Example search phrases">
        {EXAMPLE_QUERIES.map((example) => (
          <button
            key={example}
            type="button"
            className="search-example-chip"
            role="listitem"
            onClick={() => applyExample(example)}
          >
            {example}
          </button>
        ))}
      </div>

      <div className="search-form-grid">
        <HoverHelp text="Free-text match across subject, body, sender name/email, and extracted links — use natural language.">
          <label className="field">
            Keywords (plain language)
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. urgent verify account suspicious link"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  runSearch();
                }
              }}
            />
          </label>
        </HoverHelp>
        <label className="field">
          Verdict
          <select value={verdict} onChange={(e) => setVerdict(e.target.value)}>
            <option value="">Any</option>
            <option value="benign">Benign</option>
            <option value="suspicious">Suspicious</option>
            <option value="likely_phishing">Likely phishing</option>
          </select>
        </label>
        <label className="field">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </label>
        <label className="field">
          Sender email (exact)
          <input
            value={senderEmail}
            onChange={(e) => setSenderEmail(e.target.value)}
            placeholder="attacker@domain.test"
          />
        </label>
        <label className="field">
          Updated from
          <input type="date" value={updatedFrom} onChange={(e) => setUpdatedFrom(e.target.value)} />
        </label>
        <label className="field">
          Updated to
          <input type="date" value={updatedTo} onChange={(e) => setUpdatedTo(e.target.value)} />
        </label>
        <label className="field">
          Subject regex (advanced Lucene)
          <input
            value={subjectRegex}
            onChange={(e) => setSubjectRegex(e.target.value)}
            placeholder=".*verify.*account.*"
          />
        </label>
        <label className="field">
          Body regex (advanced Lucene)
          <input
            value={bodyRegex}
            onChange={(e) => setBodyRegex(e.target.value)}
            placeholder=".*example-phish.*"
          />
        </label>
      </div>

      <div className="actions">
        <HoverHelp text="Run GET /search/reviews from page 1 with the filters above. Requires elasticsearch container.">
          <button type="button" className="primary" disabled={loading} onClick={runSearch}>
            {loading ? "Searching…" : "Search reviews"}
          </button>
        </HoverHelp>
      </div>

      {error && <p className="status-failed">{error}</p>}

      {searched && !error && (
        <>
          <p className="muted">
            {total} match(es) total — showing rows {page * PAGE_SIZE + 1}–
            {Math.min((page + 1) * PAGE_SIZE, total)}.
          </p>

          <div className="toolbar review-search-panel__toolbar">
            <HoverHelp text="Re-run the current search page without changing filters.">
              <button type="button" disabled={loading} onClick={refreshResults}>
                Refresh
              </button>
            </HoverHelp>
            <HoverHelp text="Jump to the first page of search results.">
              <button type="button" disabled={loading || page === 0} onClick={() => onPageChange(0)}>
                First
              </button>
            </HoverHelp>
            <HoverHelp text="Previous page of search hits.">
              <button
                type="button"
                disabled={loading || page === 0}
                onClick={() => onPageChange(Math.max(page - 1, 0))}
              >
                Prev
              </button>
            </HoverHelp>
            <HoverHelp text="Next page when more matches exist.">
              <button
                type="button"
                disabled={loading || !hasMore}
                onClick={() => onPageChange(page + 1)}
              >
                Next
              </button>
            </HoverHelp>
            <HoverHelp text="Jump to the last page of results.">
              <button
                type="button"
                disabled={loading || page >= lastPage}
                onClick={() => onPageChange(lastPage)}
              >
                Last
              </button>
            </HoverHelp>
            <HoverHelp text="Open the page containing the first search hit on the chosen UTC date (respects active filters).">
              <label className="field field--inline-date">
                Jump to date
                <input type="date" value={jumpDate} onChange={(e) => setJumpDate(e.target.value)} />
              </label>
            </HoverHelp>
            <HoverHelp text="Navigate pagination to the selected calendar day within current search filters.">
              <button
                type="button"
                disabled={loading || !jumpDate}
                onClick={() => {
                  jumpToSearchDate(jumpDate).catch((err) => {
                    setJumpMessage(err.message || "No matches on that date.");
                  });
                }}
              >
                Go
              </button>
            </HoverHelp>
            <span className="muted">
              Page {page + 1}
              {total > 0 ? ` of ${lastPage + 1}` : ""}
            </span>
          </div>

          {jumpMessage && <p className="muted">{jumpMessage}</p>}
        </>
      )}

      {hits.length > 0 && (
        <ul className="dashboard-list">
          {hits.map((hit) => (
            <li key={hit.reviewId || hit.id}>
              <strong>{hit.subject || "(no subject)"}</strong>
              <div className="muted">
                {hit.senderEmail} · {hit.verdict || "—"} · {hit.status} ·{" "}
                {hit.updatedAt ? String(hit.updatedAt).slice(0, 19) : "—"}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
