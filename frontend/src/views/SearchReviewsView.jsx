/**
 * Search tab shell: Elasticsearch review search and optional index admin for dev.reset users.
 */
import ReviewSearchPanel from "../components/ReviewSearchPanel";
import SearchIndexPanel from "../components/SearchIndexPanel";
import { useAuth } from "../context/AuthContext";

/** Full-page ES search + optional index admin for dev.reset users. */
export default function SearchReviewsView() {
  const { hasPermission } = useAuth();
  const canDevReset = hasPermission("dev.reset");

  return (
    <main className="layout layout--single">
      <ReviewSearchPanel standalone />
      {canDevReset && <SearchIndexPanel />}
    </main>
  );
}
