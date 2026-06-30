/**
 * Elasticsearch index administration (clear all indexed reviews) — dev/admin only.
 *
 * Pattern: always render for dev.reset callers so admins see setup steps when ES is off.
 * Technology: GET /search/status, DELETE /search/index (admin or developer role).
 */
import { useCallback, useEffect, useState } from "react";
import { getJson, deleteJson } from "../api/client";
import HoverHelp from "./HoverHelp";

/** Panel showing index stats and a destructive clear action. */
export default function SearchIndexPanel() {
  const [stats, setStats] = useState(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  /** Reload index stats from GET /search/status. */
  const refresh = useCallback(() => {
    getJson("/search/status")
      .then(setStats)
      .catch(() => setStats({ enabled: false, reachable: false, documentCount: 0 }));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /** Wipe triage-reviews index after browser confirm (requires dev.reset + admin role). */
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

  const esDisabled = stats && stats.enabled === false;
  const esUnreachable = stats && stats.enabled !== false && !stats.reachable;
  const loadingStats = !stats;

  return (
    <section className="card" style={{ gridColumn: "1 / -1" }}>
      <HoverHelp text="Elasticsearch index administration — document count and dev-only clear for re-indexing demos.">
        <h2>Search index (Elasticsearch)</h2>
      </HoverHelp>

      {loadingStats && <p className="muted">Loading index status…</p>}

      {esDisabled && (
        <p className="status-failed">
          Elasticsearch is disabled (<code>ELASTICSEARCH_ENABLED=false</code>). Set it to{" "}
          <code>true</code> in <code>backend/.env.dev</code>, recreate the backend container, and
          start the <code>elasticsearch</code> Docker service — see{" "}
          <code>docs/search_guide_elasticsearch_reviews.md</code>.
        </p>
      )}

      {esUnreachable && (
        <p className="status-failed">
          Elasticsearch is enabled but unreachable. Start it with:{" "}
          <code>
            docker compose -f infra/docker/docker-compose.yml up -d elasticsearch backend
          </code>
        </p>
      )}

      {stats && stats.enabled !== false && stats.reachable && (
        <p className="muted">
          Status: connected · Documents: {stats.documentCount ?? 0} · Index:{" "}
          <code>{stats.index || "triage-reviews"}</code>
        </p>
      )}

      <div className="actions">
        <HoverHelp text="Re-fetch GET /search/status for live document count.">
          <button type="button" onClick={refresh}>
            Refresh status
          </button>
        </HoverHelp>
        <HoverHelp text="DELETE /search/index — removes all indexed review documents (dev.reset + admin/developer).">
          <button
            type="button"
            className="danger"
            disabled={loading || esDisabled || esUnreachable}
            onClick={clearIndex}
          >
            {loading ? "Clearing…" : "Clear search index"}
          </button>
        </HoverHelp>
      </div>
      {status && <p className="muted">{status}</p>}
    </section>
  );
}
