/**
 * Analyst full-text search over past reviews (Elasticsearch index).
 *
 * Pattern: React controlled form → GET /search/reviews with query + filter params.
 * Technology: Elasticsearch multi_match (plain-language keywords) + bool filters.
 *
 * @param {object} [props]
 * @param {boolean} [props.standalone] — full-width layout on dedicated #search tab
 */
import { useCallback, useState } from "react";
import { getJson } from "../api/client";
import HoverHelp from "./HoverHelp";

/** Example plain-language questions analysts can paste into the Keywords field. */
const EXAMPLE_QUERIES = [
  "verify your account password",
  "urgent wire transfer",
  "example-phish suspicious link",
  "microsoft login reset",
];

/** Search form + results table for indexed review documents. */
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  /** Build query string and call GET /search/reviews. */
  const runSearch = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (verdict) params.set("verdict", verdict);
      if (status) params.set("status", status);
      if (senderEmail.trim()) params.set("senderEmail", senderEmail.trim());
      if (updatedFrom) params.set("updatedFrom", `${updatedFrom}T00:00:00Z`);
      if (updatedTo) params.set("updatedTo", `${updatedTo}T23:59:59Z`);
      if (subjectRegex.trim()) params.set("subjectRegex", subjectRegex.trim());
      if (bodyRegex.trim()) params.set("bodyRegex", bodyRegex.trim());
      params.set("limit", "25");

      const data = await getJson(`/search/reviews?${params.toString()}`);
      if (!data.enabled) {
        setError(
          "Elasticsearch is disabled or unreachable. Open the Search past reviews tab after starting the elasticsearch Docker service (see docs/search_guide_elasticsearch_reviews.md)."
        );
        setHits([]);
        setTotal(0);
      } else {
        setHits(data.hits || []);
        setTotal(data.total || 0);
      }
      setSearched(true);
    } catch (err) {
      setError(err.message || "Search failed");
      setHits([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [query, verdict, status, senderEmail, updatedFrom, updatedTo, subjectRegex, bodyRegex]);

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
        URLs. You do not need Lucene syntax for basic searches; add verdict/status/date filters to
        narrow results.
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
                  runSearch().catch(() => {});
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
        <HoverHelp text="Run GET /search/reviews with the filters above. Requires elasticsearch container.">
          <button type="button" className="primary" disabled={loading} onClick={() => runSearch().catch(() => {})}>
            {loading ? "Searching…" : "Search reviews"}
          </button>
        </HoverHelp>
      </div>

      {error && <p className="status-failed">{error}</p>}
      {searched && !error && (
        <p className="muted">
          {total} match(es) — showing {hits.length} row(s).
        </p>
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
