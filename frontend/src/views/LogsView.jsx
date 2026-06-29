/**
 * Dedicated sub-window for central log search (merged.log).
 *
 * Pattern: full-width layout; requires logs.read permission (RBAC).
 * Technology: LogSearchPanel → GET /logs/search — see ops_guide_central_logging.md.
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
