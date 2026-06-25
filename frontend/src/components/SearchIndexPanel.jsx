/**
 * Elasticsearch index administration (clear all indexed reviews) — dev/admin only.
 */
import { useCallback, useEffect, useState } from "react";
import { getJson, deleteJson } from "../api/client";
import HoverHelp from "./HoverHelp";

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
      <HoverHelp text="Elasticsearch index administration — shows document count and allows dev reset of the review search index.">
        <h2>Search index (Elasticsearch)</h2>
      </HoverHelp>
      <p className="muted">
        Status: {stats.reachable ? "connected" : "unavailable"} · Documents:{" "}
        {stats.documentCount ?? 0} · Index: <code>{stats.index || "triage-reviews"}</code>
      </p>
      <div className="actions">
        <HoverHelp text="Re-fetch GET /search/status for live document count.">
          <button type="button" onClick={refresh}>
            Refresh status
          </button>
        </HoverHelp>
        <HoverHelp text="DELETE /search/index — removes all indexed review documents (dev/admin).">
          <button type="button" className="danger" disabled={loading} onClick={clearIndex}>
            {loading ? "Clearing…" : "Clear search index"}
          </button>
        </HoverHelp>
      </div>
      {status && <p className="muted">{status}</p>}
    </section>
  );
}
