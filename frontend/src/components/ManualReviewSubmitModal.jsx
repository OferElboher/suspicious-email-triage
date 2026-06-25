/**
 * Modal dialog for manual email submission — kept off the review dashboard so the main
 * view tracks inbound queue traffic (production apps ingest from mailboxes; paste is dev/QA only).
 *
 * Pattern: controlled modal + POST /reviews; parent receives created id for detail panel polling.
 * Technology: React portal-less fixed overlay (same stack as CRA); HoverHelp on each field.
 */
import { useCallback, useEffect, useState } from "react";
import HoverHelp from "./HoverHelp";

/**
 * @param {object} props
 * @param {boolean} props.open — when true, dialog is visible
 * @param {() => void} props.onClose — backdrop/Escape/cancel handler
 * @param {string} props.defaultSenderEmail — prefilled from signed-in user
 * @param {string} props.defaultSenderName — prefilled display name
 * @param {(payload: object) => Promise<{ id: string, status: string }>} props.onSubmit — POST /reviews
 */
export default function ManualReviewSubmitModal({
  open,
  onClose,
  defaultSenderEmail,
  defaultSenderName,
  onSubmit,
}) {
  const [senderName, setSenderName] = useState(defaultSenderName || "");
  const [senderEmail, setSenderEmail] = useState(defaultSenderEmail || "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  /** Reset form when modal opens with fresh defaults from auth context. */
  useEffect(() => {
    if (open) {
      setSenderName(defaultSenderName || "");
      setSenderEmail(defaultSenderEmail || "");
      setSubject("");
      setBody("");
      setError("");
    }
  }, [open, defaultSenderEmail, defaultSenderName]);

  /** Close on Escape — standard modal accessibility pattern. */
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onKey = (event) => {
      if (event.key === "Escape" && !submitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, submitting]);

  const handleSubmit = useCallback(async () => {
    if (submitting) {
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await onSubmit({
        senderName,
        senderEmail,
        subject: subject || "(no subject)",
        body,
        referenceSources: [],
      });
      onClose();
    } catch (err) {
      setError(err.message || "Could not queue review.");
    } finally {
      setSubmitting(false);
    }
  }, [body, onClose, onSubmit, senderEmail, senderName, subject, submitting]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!submitting) {
          onClose();
        }
      }}
    >
      <div
        className="modal-dialog card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manual-review-title"
        onClick={(event) => event.stopPropagation()}
      >
        <HoverHelp text="Paste a suspicious email for manual analysis. Production deployments normally ingest from shared mailboxes automatically.">
          <h2 id="manual-review-title" className="modal-dialog__title">
            Submit email for analysis
          </h2>
        </HoverHelp>

        <div className="row">
          <HoverHelp text="Display name shown on the review record (does not need to match a real mailbox).">
            <label className="field">
              Sender name
              <input value={senderName} onChange={(e) => setSenderName(e.target.value)} />
            </label>
          </HoverHelp>
          <HoverHelp text="From address extracted from the pasted message or entered for testing.">
            <label className="field">
              Sender email
              <input value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} />
            </label>
          </HoverHelp>
        </div>

        <HoverHelp text="Email subject line — used by the rule engine and search index.">
          <label className="field field--stacked">
            Subject
            <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
        </HoverHelp>

        <HoverHelp text="Paste full message body including headers if available. Links are extracted automatically.">
          <label className="field field--stacked">
            Body
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Paste headers and body…"
              rows={8}
            />
          </label>
        </HoverHelp>

        {error && <p className="modal-dialog__error">{error}</p>}

        <div className="actions modal-dialog__actions">
          <button type="button" disabled={submitting} onClick={onClose}>
            Cancel
          </button>
          <HoverHelp text="Creates a review in MongoDB and publishes the async Kafka ingest event.">
            <button
              type="button"
              className="primary"
              disabled={submitting}
              onClick={() => handleSubmit().catch(() => {})}
            >
              {submitting ? "Queuing…" : "Queue analysis"}
            </button>
          </HoverHelp>
        </div>
      </div>
    </div>
  );
}
