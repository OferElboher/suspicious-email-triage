/**
 * Unified log search over merged.log (central logging).
 *
 * Pattern: GET /logs/search with keyword, topic, level, time range, and regex mode.
 * Technology: Node readline stream over JSON-lines merged log file.
 */
import { useCallback, useState } from "react";
import { getJson } from "../api/client";
import HoverHelp from "./HoverHelp";

/** Admin/SOC log search panel (requires logs.read permission). */
export default function LogSearchPanel() {
  const [keyword, setKeyword] = useState("");
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState("");
  const [service, setService] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [messagePattern, setMessagePattern] = useState("");
  const [useRegex, setUseRegex] = useState(false);
  const [entries, setEntries] = useState([]);
  const [totalMatched, setTotalMatched] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runSearch = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (keyword.trim()) params.set("keyword", keyword.trim());
      if (topic.trim()) params.set("topic", topic.trim());
      if (level) params.set("level", level);
      if (service.trim()) params.set("service", service.trim());
      if (from) params.set("from", `${from}T00:00:00Z`);
      if (to) params.set("to", `${to}T23:59:59Z`);
      if (messagePattern.trim()) params.set("messagePattern", messagePattern.trim());
      if (useRegex) params.set("regex", "true");
      params.set("limit", "100");

      const data = await getJson(`/logs/search?${params.toString()}`);
      setEntries(data.entries || []);
      setTotalMatched(data.totalMatched ?? (data.entries || []).length);
    } catch (err) {
      setError(err.message || "Log search failed");
      setEntries([]);
      setTotalMatched(0);
    } finally {
      setLoading(false);
    }
  }, [keyword, topic, level, service, from, to, messagePattern, useRegex]);

  return (
    <section className="card" style={{ gridColumn: "1 / -1" }}>
      <HoverHelp text="Search merged JSON-lines logs from the Node API, Celery workers, and Kafka dispatcher. Requires logs.read permission.">
        <h2>Search unified logs</h2>
      </HoverHelp>

      <div className="search-form-grid">
        <HoverHelp text="Plain text or regex match against log message bodies.">
          <label className="field">
            Keyword
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="failed, graph sync, reviewId"
            />
          </label>
        </HoverHelp>
        <label className="field field--checkbox">
          <input
            type="checkbox"
            checked={useRegex}
            onChange={(e) => setUseRegex(e.target.checked)}
          />
          Treat keyword as regex
        </label>
        <label className="field">
          Topic contains
          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="celery" />
        </label>
        <label className="field">
          Level
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">Any</option>
            <option value="debug">debug</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </select>
        </label>
        <label className="field">
          Service
          <input value={service} onChange={(e) => setService(e.target.value)} placeholder="backend" />
        </label>
        <label className="field">
          From (date)
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="field">
          To (date)
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="field">
          Message regex
          <input
            value={messagePattern}
            onChange={(e) => setMessagePattern(e.target.value)}
            placeholder="task (done|failed)"
          />
        </label>
      </div>

      <div className="actions">
        <HoverHelp text="Run GET /logs/search with the filters above.">
          <button type="button" disabled={loading} onClick={() => runSearch().catch(() => {})}>
            {loading ? "Searching…" : "Search logs"}
          </button>
        </HoverHelp>
      </div>

      {error && <p className="status-failed">{error}</p>}
      {!error && entries.length > 0 && (
        <p className="muted">{totalMatched} matching line(s) — showing {entries.length}.</p>
      )}
      {entries.length > 0 && (
        <pre className="log-search-results">
          {entries.map((row, idx) => (
            <code key={`${row.ts}-${idx}`}>{JSON.stringify(row)}</code>
          ))}
        </pre>
      )}
    </section>
  );
}
