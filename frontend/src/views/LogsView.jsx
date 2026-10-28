/**
 * This view hosts LogSearchPanel for the #logs tab.
 *
 * It provides unified search over merged.log through the Node API rather than Elasticsearch.
 *
 * Operators filter by service name (backend, ai-celery, ingest-gateway, etc.) to trace incidents across containers.
 *
 * Access requires logs.read permission.
 */
import LogSearchPanel from "../components/LogSearchPanel";

/** Mount point for unified log search — separated from review dashboard. */
export default function LogsView() {
  return (
    <main className="layout layout--single">
      <LogSearchPanel standalone />
    </main>
  );
}
