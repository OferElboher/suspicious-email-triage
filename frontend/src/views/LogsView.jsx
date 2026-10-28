/**
 * Logs tab shell: unified merged.log search via LogSearchPanel (logs.read permission).
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
