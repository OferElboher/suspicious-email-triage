/**
 * Dedicated Elasticsearch review search sub-window (#search).
 *
 * Pattern: mirrors LogsView — full-width tools moved off the crowded dashboard footer.
 * Technology: ReviewSearchPanel (reviews.read) + SearchIndexPanel (dev.reset admin).
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
