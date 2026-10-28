/**
 * This view wraps ReviewSearchPanel in a full-width layout for the #search tab.
 *
 * Search runs against Elasticsearch via GET /search/reviews with plain-language keywords and filters.
 *
 * Users with dev.reset permission also see SearchIndexPanel for index maintenance in development.
 *
 * It requires reviews.read (and related search permissions) from JWT claims.
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
