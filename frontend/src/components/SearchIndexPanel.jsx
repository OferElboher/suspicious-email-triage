/**
 * Elasticsearch index administration (clear all indexed reviews) — dev/admin only.
 */
import { useCallback, useEffect, useState } from "react";
import { getJson, deleteJson } from "../api/client";

/** Panel showing index stats and a destructive clear action. */
export default function SearchIndexPanel() {
  const [stats, setStats] = useState(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    getJson("/search/status")
      .then(setStats)
      .catch(() => setStats({ enabled: false, reachable: false }));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const clearIndex = async () => {
    if (!window.confirm("Delete all documents in the Elasticsearch review index?")) {
      return;
    }
    setLoading(true);
    setStatus("");
    try {
      const data = await deleteJson("/search/index");
      setStatus(data.cleared ? "Search index cleared." : data.reason || "Clear failed.");
      refresh();
    } catch (err) {
      setStatus(err.message || "Clear failed.");
    } finally {
      setLoading(false);
    }
  };

  if (!stats?.enabled) {
    return null;
  }

  return (
    <section className="card" style={{ gridColumn: "1 / -1" }}>
      <h2>Search index (Elasticsearch)</h2>
      <p className="muted">
        Full-text search over review subject, body, and links. Index name:{" "}
        <code>{stats.index || "triage-reviews"}</code>
      </p>
      <p className="muted">
        Status: {stats.reachable ? "connected" : "unavailable"} · Documents:{" "}
        {stats.documentCount ?? 0}
      </p>
      <div className="actions">
        <button type="button" onClick={refresh}>
          Refresh status
        </button>
        <button type="button" className="danger" disabled={loading} onClick={clearIndex}>
          {loading ? "Clearing…" : "Clear search index"}
        </button>
      </div>
      {status && <p className="muted">{status}</p>}
    </section>
  );
}
