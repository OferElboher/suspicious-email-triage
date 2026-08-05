/**
 * Form for registering a mail platform's default verdict webhook URL (ingestClientId → callbackUrl).
 *
 * Pattern: PUT /ingest/clients/:clientId with JWT (ingest.clients.write permission).
 * Technology: controlled React form, postJson/putJson from api client.
 */
import { useState } from "react";
import { putJson } from "../api/client";
import HoverHelp from "./HoverHelp";

/**
 * @param {{ onRegistered?: () => void }} props — onRegistered refreshes verdict delivery metrics
 */
export default function RegisterIngestClientForm({ onRegistered }) {
  const [clientId, setClientId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [callbackUrl, setCallbackUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  /** submitRegistration validates fields and upserts one ingest_clients row via JWT API. */
  async function submitRegistration(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    const slug = clientId.trim();
    const name = displayName.trim();
    const url = callbackUrl.trim();
    if (!slug || !name || !url) {
      setError("clientId, display name, and callback URL are required.");
      return;
    }
    setBusy(true);
    try {
      const result = await putJson(`/ingest/clients/${encodeURIComponent(slug)}`, {
        displayName: name,
        callbackUrl: url,
        isActive: true,
      });
      setMessage(
        `Registered ${result.client?.clientId || slug} → ${result.client?.callbackUrl || url}`
      );
      setClientId("");
      setDisplayName("");
      setCallbackUrl("");
      if (onRegistered) {
        await onRegistered();
      }
    } catch (err) {
      setError(err.message || "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ingest-dashboard__register card" data-testid="register-ingest-client-form">
      <HoverHelp text="Each mail platform (SEG, Graph adapter, Postfix helper) gets a stable ingestClientId. When analysis completes, Node POSTs the verdict to the callback URL stored here unless a per-message callbackUrl override is sent on ingest.">
        <h4>Register mail platform webhook</h4>
      </HoverHelp>
      <p className="muted">
        Saves a default verdict webhook URL in Postgres <code>ingest_clients</code>. Requires{" "}
        <code>ingest.clients.write</code> permission (admin, manager, developer). Mail platform
        automation can also call <code>PUT /ingest/register/:clientId</code> with{" "}
        <code>X-Ingest-Registration-Token</code>.
      </p>
      <form className="ingest-dashboard__register-form" onSubmit={(e) => submitRegistration(e)}>
        <label>
          Client ID (slug)
          <input
            type="text"
            value={clientId}
            placeholder="contoso-graph"
            disabled={busy}
            onChange={(e) => setClientId(e.target.value)}
          />
        </label>
        <label>
          Display name
          <input
            type="text"
            value={displayName}
            placeholder="Contoso Microsoft Graph adapter"
            disabled={busy}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        <label>
          Default callback URL (HTTPS in production)
          <input
            type="url"
            value={callbackUrl}
            placeholder="https://seg.example.com/v1/triage-verdict"
            disabled={busy}
            onChange={(e) => setCallbackUrl(e.target.value)}
          />
        </label>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? "Saving…" : "Save platform webhook"}
        </button>
      </form>
      {error && <p className="error-banner">{error}</p>}
      {message && <p className="ok-banner">{message}</p>}
    </section>
  );
}
