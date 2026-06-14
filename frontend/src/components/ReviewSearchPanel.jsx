/**
 * Analyst full-text search over past reviews (Elasticsearch index).
 *
 * Pattern: React controlled form → GET /search/reviews with query + filter params.
 * Technology: Elasticsearch multi_match + bool filters (verdict, date range, regexp).
 */
import { useCallback, useState } from "react";
import { getJson } from "../api/client";

/** Search form + results table for indexed review documents. */
export default function ReviewSearchPanel() {
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
        setError("Elasticsearch is disabled or unreachable. Start the elasticsearch Docker service.");
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

  return (
    <section className="card" style={{ gridColumn: "1 / -1" }}>
      <h2>Search past reviews</h2>
      <p className="muted">
        Full-text and advanced filters over the Elasticsearch index{" "}
        <code>triage-reviews</code>. Combine keyword search with verdict, status, sender,
        date ranges, and Lucene regex patterns on subject/body.
      </p>

      <div className="search-form-grid">
        <label className="field">
          Keywords
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="phishing, verify account, example-phish"
          />
        </label>
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
          Subject regex (Lucene)
          <input
            value={subjectRegex}
            onChange={(e) => setSubjectRegex(e.target.value)}
            placeholder=".*verify.*account.*"
          />
        </label>
        <label className="field">
          Body regex (Lucene)
          <input
            value={bodyRegex}
            onChange={(e) => setBodyRegex(e.target.value)}
            placeholder=".*example-phish.*"
          />
        </label>
      </div>

      <div className="actions">
        <button type="button" disabled={loading} onClick={() => runSearch().catch(() => {})}>
          {loading ? "Searching…" : "Search reviews"}
        </button>
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
