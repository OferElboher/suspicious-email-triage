/**
 * Primary analyst UI shell: navigation between triage workspace and analytics dashboards.
 * Capability flags (`/dev/features`) decide whether dev-only simulation controls render.
 */
import { useCallback, useEffect, useState } from "react";
import { postJson, getJson } from "./api/client";
import { useReviewPoller } from "./hooks/useReviewPoller";
import AnalyticsView from "./views/AnalyticsView";
import SimulationPanel from "./views/SimulationPanel";

/** Page size for the dashboard list; kept aligned with backend pagination limits. */
const PAGE_SIZE = 20;

export default function TriageApp() {
  /** Active high-level screen: triage form vs analytics charts. */
  const [screen, setScreen] = useState("workspace");
  /** Feature flags from API (simulation allowed only in dev deployment). */
  const [features, setFeatures] = useState({
    simulation: false,
    analytics: true,
    simulationMaxEventsPerMin: 30,
  });

  const [senderName, setSenderName] = useState("Analyst");
  const [senderEmail, setSenderEmail] = useState("analyst@local.test");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [active, setActive] = useState(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [reviews, setReviews] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    getJson("/dev/features")
      .then((data) =>
        setFeatures({
          simulation: Boolean(data.simulation),
          analytics: data.analytics !== false,
          simulationMaxEventsPerMin: Number(data.simulationMaxEventsPerMin) || 30,
        })
      )
      .catch(() => {
        /* non-fatal: UI still works with conservative defaults */
      });
  }, []);

  const onPoll = useCallback((doc) => {
    setActive(doc);
  }, []);

  useReviewPoller(active?._id, onPoll);

  const fetchPage = useCallback(async () => {
    const data = await getJson(`/reviews?limit=${PAGE_SIZE}&page=${page}`);
    setReviews(data.data || []);
    setHasMore(Boolean(data.hasMore));
  }, [page]);

  useEffect(() => {
    fetchPage().catch(() => setReviews([]));
  }, [fetchPage]);

  const submit = async () => {
    setActive(null);
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
          <div className="app-tag">Kafka ingest → Celery scoring · poll for status</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <span className="pill">Professional workspace</span>
          <nav className="nav-tabs" aria-label="Primary views">
            <button
              type="button"
              className={screen === "workspace" ? "active" : ""}
              onClick={() => setScreen("workspace")}
            >
              Triage workspace
            </button>
            {features.analytics && (
              <button
                type="button"
                className={screen === "analytics" ? "active" : ""}
                onClick={() => setScreen("analytics")}
              >
                Analytics & graphs
              </button>
            )}
          </nav>
        </div>
      </header>

      {screen === "analytics" && features.analytics && (
        <main className="layout">
          <AnalyticsView />
        </main>
      )}

      {screen === "workspace" && (
        <main className="layout">
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
                onClick={() => submit().catch((e) => window.alert(e.message))}
              >
                Queue analysis
              </button>
            </div>
          </section>

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
          </section>

          {features.simulation && (
            <SimulationPanel maxPerMin={features.simulationMaxEventsPerMin} />
          )}

          <section className="card" style={{ gridColumn: "1 / -1" }}>
            <h2>Recent reviews</h2>
            <div className="toolbar">
              <button type="button" onClick={() => fetchPage().catch(() => {})}>
                Refresh
              </button>
              <button type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(p - 1, 0))}>
                Prev
              </button>
              <button type="button" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
              <span className="muted">Page {page}</span>
            </div>
            <ul className="dashboard-list">
              {reviews.map((r) => (
                <li key={r._id}>
                  <strong>{r.subject}</strong>
                  <div className="muted">
                    {r.senderEmail} · {r.status} · {r.analysisResult?.verdict || "—"}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </main>
      )}
    </div>
  );
}
