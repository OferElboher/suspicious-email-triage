/**
 * Primary analyst UI shell — icon navigation bar and dedicated sub-windows.
 *
 * Sub-windows: Review dashboard, Analytics, Phishing graph, Logs, Admin, Settings.
 * Pattern: URL hash routing (appScreenNavigation.js) + RBAC-gated AppNavBar icons.
 */
import { useCallback, useEffect, useState } from "react";
import { postJson, getJson } from "./api/client";
import { useAuth } from "./context/AuthContext";
import { useAppScreen } from "./hooks/useAppScreen";
import { useReviewPoller } from "./hooks/useReviewPoller";
import AnalyticsView from "./views/AnalyticsView";
import GraphView from "./views/GraphView";
import LogsView from "./views/LogsView";
import SettingsView from "./views/SettingsView";
import AdminView from "./views/AdminView";
import SimulationPanel from "./views/SimulationPanel";
import AppNavBar from "./components/AppNavBar";
import RecentReviewsList from "./components/RecentReviewsList";
import ReviewDetailPanel, { OVERRIDE_ACTIONS } from "./components/ReviewDetailPanel";
import ManualReviewSubmitModal from "./components/ManualReviewSubmitModal";
import SearchIndexPanel from "./components/SearchIndexPanel";
import ReviewSearchPanel from "./components/ReviewSearchPanel";
import HoverHelp from "./components/HoverHelp";

/** Page size for the dashboard list; kept aligned with backend pagination limits. */
const PAGE_SIZE = 20;

export default function TriageApp() {
  const { user, logout, hasPermission, hasRole } = useAuth();
  /** Feature flags from GET /dev/features (simulation + reset for admin/developer in dev). */
  const [features, setFeatures] = useState(() => ({
    simulation: false,
    analytics: hasPermission("metrics.read"),
    simulationMaxEventsPerMin: 30,
  }));
  const [featuresLoaded, setFeaturesLoaded] = useState(false);

  const canReadReviews = hasPermission("reviews.read");
  const canWrite = hasPermission("reviews.write");
  const canOverride = hasPermission("reviews.override");
  const canDevReset = hasPermission("dev.reset");
  const canReadLogs = hasPermission("logs.read");
  const canReadGraph = hasPermission("graph.read");
  const canAdminUsers = hasRole("admin") || hasPermission("admin.users");

  const canAccessScreen = useCallback(
    (view) => {
      if (view === "workspace") {
        return canReadReviews;
      }
      if (view === "analytics") {
        return features.analytics && hasPermission("metrics.read");
      }
      if (view === "graph") {
        return canReadGraph;
      }
      if (view === "logs") {
        return canReadLogs;
      }
      if (view === "admin") {
        return canAdminUsers;
      }
      if (view === "settings") {
        return true;
      }
      return false;
    },
    [
      canAdminUsers,
      canReadGraph,
      canReadLogs,
      canReadReviews,
      features.analytics,
      hasPermission,
    ]
  );

  const [screen, setScreen] = useAppScreen(
    featuresLoaded ? canAccessScreen : () => true
  );

  const [active, setActive] = useState(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideVerdict, setOverrideVerdict] = useState("suspicious");
  const [reviews, setReviews] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [totalReviews, setTotalReviews] = useState(0);
  const [includeSimulation, setIncludeSimulation] = useState(false);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);

  const lastPage = Math.max(0, Math.ceil(totalReviews / PAGE_SIZE) - 1);

  useEffect(() => {
    getJson("/dev/features")
      .then((data) =>
        setFeatures({
          simulation: Boolean(data.simulation),
          analytics: Boolean(data.analytics),
          simulationMaxEventsPerMin: Number(data.simulationMaxEventsPerMin) || 30,
        })
      )
      .catch(() => {
        setFeatures((current) => ({
          ...current,
          analytics: hasPermission("metrics.read"),
        }));
      })
      .finally(() => setFeaturesLoaded(true));
  }, [hasPermission]);

  const onPoll = useCallback((doc) => {
    setActive(doc);
  }, []);

  useReviewPoller(active?._id, onPoll);

  /** Keep override verdict dropdown aligned with the loaded analysis result. */
  useEffect(() => {
    if (active?.analysisResult?.verdict) {
      setOverrideVerdict(active.analysisResult.verdict);
    }
  }, [active?._id, active?.analysisResult?.verdict]);

  const fetchPage = useCallback(async () => {
    const sim = includeSimulation ? "&includeSimulation=true" : "";
    const data = await getJson(`/reviews?limit=${PAGE_SIZE}&page=${page}${sim}`);
    const rows = data.data || [];
    const seen = new Set();
    const unique = rows.filter((row) => {
      const id = String(row._id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    setReviews(unique);
    setHasMore(Boolean(data.hasMore));
    setTotalReviews(Number(data.total) || 0);
  }, [page, includeSimulation]);

  /** Jump pagination to the page that contains the first review on a calendar day (UTC). */
  const jumpToReviewDate = useCallback(
    async (dateStr) => {
      const sim = includeSimulation ? "&includeSimulation=true" : "";
      try {
        const data = await getJson(
          `/reviews/page-for-date?date=${encodeURIComponent(dateStr)}&limit=${PAGE_SIZE}${sim}`
        );
        setPage(data.page);
        return {
          message: `Page ${data.page + 1} — ${data.onDayCount} review(s) on ${data.date}.`,
        };
      } catch (err) {
        if (err.body?.error === "no_reviews_on_date") {
          throw new Error(`No reviews on ${dateStr}.`);
        }
        throw err;
      }
    },
    [includeSimulation]
  );

  useEffect(() => {
    if (hasPermission("reviews.read")) {
      fetchPage().catch(() => setReviews([]));
    }
  }, [fetchPage, hasPermission]);

  /** Load full review into detail panel when analyst selects a queue row. */
  const selectReview = useCallback(async (reviewId) => {
    try {
      const doc = await getJson(`/reviews/${reviewId}`);
      setActive({ ...doc, _polling: doc.status === "pending" });
    } catch (_err) {
      setActive(null);
    }
  }, []);

  /** POST /reviews from modal — opens detail panel on created id and refreshes queue page 0. */
  const submitManualReview = useCallback(
    async (payload) => {
      const created = await postJson("/reviews", payload);
      setPage(0);
      setActive({
        _id: created.id,
        status: created.status || "pending",
        analysisResult: null,
        _polling: true,
        subject: payload.subject,
        senderEmail: payload.senderEmail,
      });
      const sim = includeSimulation ? "&includeSimulation=true" : "";
      const list = await getJson(`/reviews?limit=${PAGE_SIZE}&page=0${sim}`);
      const rows = list.data || [];
      const seen = new Set();
      setReviews(
        rows.filter((row) => {
          const id = String(row._id);
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        })
      );
      setHasMore(Boolean(list.hasMore));
      setTotalReviews(Number(list.total) || 0);
      return created;
    },
    [includeSimulation]
  );

  const saveOverride = async () => {
    if (!active?._id || !active.analysisResult) return;
    const res = await postJson(`/reviews/${active._id}/override`, {
      verdict: overrideVerdict,
      recommendedAction: OVERRIDE_ACTIONS[overrideVerdict] || "investigate",
      reason: overrideReason,
    });
    const updated = res.review
      ? await getJson(`/reviews/${active._id}`)
      : { ...active, override: res.override };
    setActive(updated);
    await fetchPage();
    window.alert("Override saved");
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1 className="app-title">Suspicious email triage</h1>
          <div className="app-tag">
            Signed in as {user?.email} · roles: {(user?.roles || []).join(", ") || "none"}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <div className="toolbar">
            <span className="pill">Authenticated workspace</span>
            <button type="button" onClick={logout}>
              Sign out
            </button>
          </div>
          <AppNavBar
            screen={screen}
            setScreen={setScreen}
            access={{
              workspace: canReadReviews,
              analytics: features.analytics && hasPermission("metrics.read"),
              graph: canReadGraph,
              logs: canReadLogs,
              admin: canAdminUsers,
              settings: true,
            }}
          />
        </div>
      </header>

      {screen === "analytics" && features.analytics && hasPermission("metrics.read") && (
        <main className="layout">
          <AnalyticsView />
        </main>
      )}

      {screen === "graph" && canReadGraph && (
        <main className="layout">
          <GraphView />
        </main>
      )}

      {screen === "logs" && canReadLogs && <LogsView />}

      {screen === "admin" && canAdminUsers && <AdminView />}

      {screen === "settings" && <SettingsView onSignOut={logout} />}

      {screen === "workspace" && canReadReviews && (
        <main className="layout layout--dashboard">
          <div className="dashboard-column dashboard-column--queue">
            <div className="dashboard-toolbar">
              <HoverHelp text="Total reviews in MongoDB matching current filters (simulation hidden unless enabled).">
                <span className="dashboard-stat-pill">
                  {totalReviews} review{totalReviews === 1 ? "" : "s"} tracked
                </span>
              </HoverHelp>
              {canWrite && (
                <HoverHelp text="Open manual paste dialog for dev/QA — production ingests from mailboxes.">
                  <button
                    type="button"
                    className="primary"
                    onClick={() => setSubmitModalOpen(true)}
                  >
                    Submit email
                  </button>
                </HoverHelp>
              )}
            </div>

            <RecentReviewsList
              reviews={reviews}
              page={page}
              lastPage={lastPage}
              hasMore={hasMore}
              totalReviews={totalReviews}
              selectedReviewId={active?._id}
              onSelectReview={selectReview}
              includeSimulation={includeSimulation}
              onIncludeSimulationChange={setIncludeSimulation}
              onRefresh={() => fetchPage().catch(() => {})}
              onPageChange={setPage}
              onJumpToDate={jumpToReviewDate}
            />
          </div>

          <div className="dashboard-column dashboard-column--detail">
            <ReviewDetailPanel
              review={active}
              canOverride={canOverride}
              overrideReason={overrideReason}
              overrideVerdict={overrideVerdict}
              onOverrideReasonChange={setOverrideReason}
              onOverrideVerdictChange={setOverrideVerdict}
              onSaveOverride={saveOverride}
            />
          </div>

          <div className="dashboard-tools">
            {features.simulation && (
              <SimulationPanel maxPerMin={features.simulationMaxEventsPerMin} />
            )}
            {canDevReset && <SearchIndexPanel />}
            {canReadReviews && <ReviewSearchPanel />}
          </div>
        </main>
      )}

      <ManualReviewSubmitModal
        open={submitModalOpen}
        onClose={() => setSubmitModalOpen(false)}
        defaultSenderEmail={user?.email || ""}
        defaultSenderName={user?.email?.split("@")[0] || "Analyst"}
        onSubmit={submitManualReview}
      />
    </div>
  );
}
