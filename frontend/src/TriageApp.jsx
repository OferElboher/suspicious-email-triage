/**
 * Primary analyst UI shell: navigation between triage workspace and analytics dashboards.
 * Capability flags (`/dev/features`) decide whether dev-only simulation controls render.
 */
import { useCallback, useEffect, useState } from "react";
import { postJson, getJson } from "./api/client";
import { useAuth } from "./context/AuthContext";
import { useAppScreen } from "./hooks/useAppScreen";
import { useReviewPoller } from "./hooks/useReviewPoller";
import AnalyticsView from "./views/AnalyticsView";
import GraphView from "./views/GraphView";
import SimulationPanel from "./views/SimulationPanel";
import ThemeSelector from "./components/ThemeSelector";
import RecentReviewsList from "./components/RecentReviewsList";
import SearchIndexPanel from "./components/SearchIndexPanel";
import { djangoAdminUrl } from "./lib/appUrls";

/** Page size for the dashboard list; kept aligned with backend pagination limits. */
const PAGE_SIZE = 20;

export default function TriageApp() {
  const { user, logout, hasPermission, hasRole } = useAuth();
  /** Feature flags from API (simulation allowed only for developer role in dev deployment). */
  const [features, setFeatures] = useState(() => ({
    simulation: false,
    analytics: hasPermission("metrics.read"),
    simulationMaxEventsPerMin: 30,
  }));
  const [featuresLoaded, setFeaturesLoaded] = useState(false);

  const canReadReviews = hasPermission("reviews.read");
  const canReadGraph = hasPermission("graph.read");
  const canWrite = hasPermission("reviews.write");
  const canOverride = hasPermission("reviews.override");
  const canDevReset = hasPermission("dev.reset");

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
      return false;
    },
    [canReadGraph, canReadReviews, features.analytics, hasPermission]
  );

  const [screen, setScreen] = useAppScreen(
    featuresLoaded ? canAccessScreen : () => true
  );

  const [senderName, setSenderName] = useState(user?.email?.split("@")[0] || "Analyst");
  const [senderEmail, setSenderEmail] = useState(user?.email || "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [active, setActive] = useState(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [reviews, setReviews] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [totalReviews, setTotalReviews] = useState(0);
  const [includeSimulation, setIncludeSimulation] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const lastPage = Math.max(0, Math.ceil(totalReviews / PAGE_SIZE) - 1);

  useEffect(() => {
    if (user?.email) {
      setSenderEmail(user.email);
      setSenderName(user.email.split("@")[0]);
    }
  }, [user]);

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

  useEffect(() => {
    if (hasPermission("reviews.read")) {
      fetchPage().catch(() => setReviews([]));
    }
  }, [fetchPage, hasPermission]);

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setActive(null);
    try {
      const created = await postJson("/reviews", {
        senderName,
        senderEmail,
        subject: subject || "(no subject)",
        body,
        referenceSources: [],
      });
      setActive({
        _id: created.id,
        status: created.status || "pending",
        analysisResult: null,
        _polling: true,
      });
      setPage(0);
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
    } finally {
      setSubmitting(false);
    }
  };

  const saveOverride = async () => {
    if (!active?._id || !active.analysisResult) return;
    await postJson(`/reviews/${active._id}/override`, {
      verdict: active.analysisResult.verdict,
      recommendedAction: active.analysisResult.recommendedAction,
      reason: overrideReason,
    });
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
            <ThemeSelector />
            <span className="pill">Authenticated workspace</span>
            {hasRole("admin") && (
              <a
                className="button-link"
                href={djangoAdminUrl()}
                target="_blank"
                rel="noopener noreferrer"
              >
                User administration
              </a>
            )}
            <button type="button" onClick={logout}>
              Sign out
            </button>
          </div>
          <nav className="nav-tabs" aria-label="Primary views">
            {canReadReviews && (
              <button
                type="button"
                className={screen === "workspace" ? "active" : ""}
                onClick={() => setScreen("workspace")}
              >
                Triage workspace
              </button>
            )}
            {features.analytics && hasPermission("metrics.read") && (
              <button
                type="button"
                className={screen === "analytics" ? "active" : ""}
                onClick={() => setScreen("analytics")}
              >
                Analytics & graphs
              </button>
            )}
            {canReadGraph && (
              <button
                type="button"
                className={screen === "graph" ? "active" : ""}
                onClick={() => setScreen("graph")}
              >
                Phishing graph
              </button>
            )}
          </nav>
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

      {screen === "workspace" && canReadReviews && (
        <main className="layout">
          {canWrite && (
            <section className="card">
              <h2>New review</h2>
              <div className="row">
                <div>
                  <label className="field">Sender name</label>
                  <input value={senderName} onChange={(e) => setSenderName(e.target.value)} />
                </div>
                <div>
                  <label className="field">Sender email</label>
                  <input value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} />
                </div>
              </div>
              <div style={{ marginTop: "0.65rem" }}>
                <label className="field">Subject</label>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div style={{ marginTop: "0.65rem" }}>
                <label className="field">Body</label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Paste headers + body…"
                />
              </div>
              <div className="actions">
                <button
                  className="primary"
                  type="button"
                  disabled={submitting}
                  onClick={() => submit().catch((e) => window.alert(e.message))}
                >
                  {submitting ? "Queuing…" : "Queue analysis"}
                </button>
              </div>
            </section>
          )}

          <section className="card">
            <h2>Result</h2>
            {!active && <p className="muted">Submit an email to see pipeline status.</p>}
            {active && (
              <>
                <p className={`status-${active.status}`}>
                  <strong>Status:</strong> {active.status}
                  {active._polling ? " · updating" : ""}
                </p>
                {active.analysisResult && (
                  <>
                    <p>
                      <strong>Verdict:</strong> {active.analysisResult.verdict}
                    </p>
                    <p>
                      <strong>Action:</strong> {active.analysisResult.recommendedAction}
                    </p>
                    <p>
                      <strong>Summary:</strong> {active.analysisResult.summary}
                    </p>
                    <h3 className="muted" style={{ fontSize: "0.95rem" }}>
                      Findings
                    </h3>
                    <ul className="findings">
                      {(active.analysisResult.findings || []).map((f, i) => (
                        <li key={i}>
                          <strong>{f.severity}:</strong> {f.explanation}
                          {f.evidence && (
                            <>
                              <br />
                              <span className="muted">{f.evidence}</span>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                    <h3 className="muted" style={{ fontSize: "0.95rem" }}>
                      Follow-ups
                    </h3>
                    <ul className="findings">
                      {(active.analysisResult.followUpQuestions || []).map((q, i) => (
                        <li key={i}>{q}</li>
                      ))}
                    </ul>
                    {canOverride && (
                      <>
                        <div style={{ marginTop: "0.75rem" }}>
                          <label className="field">Override reason</label>
                          <input
                            value={overrideReason}
                            onChange={(e) => setOverrideReason(e.target.value)}
                          />
                        </div>
                        <div className="actions">
                          <button
                            type="button"
                            onClick={() => saveOverride().catch((e) => window.alert(e.message))}
                          >
                            Save override
                          </button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </section>

          {features.simulation && (
            <SimulationPanel maxPerMin={features.simulationMaxEventsPerMin} />
          )}

          {canDevReset && <SearchIndexPanel />}

          <RecentReviewsList
            reviews={reviews}
            page={page}
            lastPage={lastPage}
            hasMore={hasMore}
            totalReviews={totalReviews}
            canReadGraph={canReadGraph}
            includeSimulation={includeSimulation}
            onIncludeSimulationChange={setIncludeSimulation}
            onRefresh={() => fetchPage().catch(() => {})}
            onPageChange={setPage}
          />
        </main>
      )}
    </div>
  );
}
