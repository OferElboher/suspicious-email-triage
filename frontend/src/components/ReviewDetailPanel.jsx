/**
 * Right-column review detail — pipeline status, AI verdict, findings, and analyst override.
 *
 * Pattern: parent loads GET /reviews/:id into `review`; useReviewPoller refreshes while pending.
 * Technology: effectiveVerdict helper merges analyst override over analysisResult.
 */
import HoverHelp from "./HoverHelp";
import { effectiveVerdict, hasOverride } from "../lib/effectiveVerdict";

/** Override verdict dropdown options (persisted on review.override in MongoDB). */
const OVERRIDE_VERDICTS = [
  { value: "benign", label: "Benign" },
  { value: "suspicious", label: "Suspicious" },
  { value: "likely_phishing", label: "Likely phishing" },
];

/** Recommended action stored alongside override verdict. */
const OVERRIDE_ACTIONS = {
  benign: "close",
  suspicious: "investigate",
  likely_phishing: "report_and_block",
};

/**
 * @param {object} props
 * @param {object|null} props.review — full review document from GET /reviews/:id
 * @param {boolean} props.canOverride — reviews.override permission
 * @param {string} props.overrideReason — controlled notes field
 * @param {string} props.overrideVerdict — controlled verdict dropdown
 * @param {(value: string) => void} props.onOverrideReasonChange
 * @param {(value: string) => void} props.onOverrideVerdictChange
 * @param {() => Promise<void>} props.onSaveOverride
 */
export default function ReviewDetailPanel({
  review,
  canOverride,
  overrideReason,
  overrideVerdict,
  onOverrideReasonChange,
  onOverrideVerdictChange,
  onSaveOverride,
}) {
  return (
    <section className="card review-detail-panel">
      <HoverHelp text="Select a review from the queue or submit a new email to inspect pipeline status and verdict.">
        <h2>Review detail</h2>
      </HoverHelp>

      {!review && (
        <p className="muted">Select a review from the queue to inspect analysis results.</p>
      )}

      {review && (
        <>
          <p className={`status-${review.status}`}>
            <strong>Status:</strong> {review.status}
            {review._polling ? " · updating" : ""}
          </p>
          <p className="muted review-detail-panel__meta">
            {review.senderEmail} · {review.subject}
          </p>

          {review.analysisResult && (
            <>
              <p>
                <strong>Verdict:</strong> {effectiveVerdict(review)}
                {hasOverride(review) && <span className="muted"> (analyst override)</span>}
              </p>
              <p>
                <strong>Action:</strong> {review.analysisResult.recommendedAction}
              </p>
              <p>
                <strong>Summary:</strong> {review.analysisResult.summary}
              </p>

              <HoverHelp text="Rule engine and optional LLM findings with severity and evidence snippets.">
                <h3 className="muted review-detail-panel__subtitle">Findings</h3>
              </HoverHelp>
              <ul className="findings">
                {(review.analysisResult.findings || []).map((finding, index) => (
                  <li key={index}>
                    <strong>{finding.severity}:</strong> {finding.explanation}
                    {finding.evidence && (
                      <>
                        <br />
                        <span className="muted">{finding.evidence}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>

              <h3 className="muted review-detail-panel__subtitle">Follow-ups</h3>
              <ul className="findings">
                {(review.analysisResult.followUpQuestions || []).map((question, index) => (
                  <li key={index}>{question}</li>
                ))}
              </ul>

              {canOverride && (
                <>
                  <HoverHelp text="Analyst verdict replaces the automated score for display and Neo4j graph sync.">
                    <label className="field field--stacked">
                      Override verdict
                      <select
                        className="field-select-spaced"
                        value={overrideVerdict}
                        onChange={(e) => onOverrideVerdictChange(e.target.value)}
                      >
                        {OVERRIDE_VERDICTS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </HoverHelp>
                  <HoverHelp text="Optional audit notes — does not change the verdict by itself.">
                    <label className="field field--stacked">
                      Override reason (notes)
                      <input
                        value={overrideReason}
                        onChange={(e) => onOverrideReasonChange(e.target.value)}
                        placeholder="Why you changed the verdict"
                      />
                    </label>
                  </HoverHelp>
                  <div className="actions">
                    <button type="button" onClick={() => onSaveOverride().catch(() => {})}>
                      Save override
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {!review.analysisResult && review.status === "pending" && (
            <p className="muted">Analysis in progress — Kafka → Celery pipeline.</p>
          )}
        </>
      )}
    </section>
  );
}

export { OVERRIDE_VERDICTS, OVERRIDE_ACTIONS };
