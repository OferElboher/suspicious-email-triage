/**
 * Verdict delivery panel — shows outbound webhook stats and mock mail-platform receiver log.
 *
 * Pattern: polls GET /metrics/verdict-delivery; bar chart of mock receiver verdict counts.
 * Technology: Recharts (same as IngestDashboardView per-minute chart).
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import HoverHelp from "./HoverHelp";
import RegisterIngestClientForm from "./RegisterIngestClientForm";

/** Format integer counts for stat cards. */
function fmt(n) {
  return Number(n || 0).toLocaleString();
}

/**
 * @param {{ snapshot: object|null, loading: boolean, error: string, canManageClients?: boolean, onClientsChanged?: () => void }} props
 */
export default function VerdictDeliveryPanel({
  snapshot,
  loading,
  error,
  canManageClients = false,
  onClientsChanged,
}) {
  const delivery = snapshot?.delivery || {};
  const counts = delivery.counts || {};
  const mockStats = snapshot?.mockReceiver || {};
  const mockCallbacks = snapshot?.mockCallbacks || [];
  const templates = snapshot?.simulationTemplates || [];

  const chartData = Object.entries(mockStats.byVerdict || {}).map(([verdict, count]) => ({
    verdict,
    count,
  }));

  return (
    <section className="ingest-dashboard__verdict card" data-testid="verdict-delivery-panel">
      <HoverHelp text="When analysis completes, Node POSTs a JSON verdict webhook. Each mail platform registers a default URL under ingestClientId in Postgres; optional per-message callbackUrl overrides it.">
        <h3>Outbound verdict delivery</h3>
      </HoverHelp>
      <p className="muted">
        Callback resolution: per-message <code>callbackUrl</code> → Postgres{" "}
        <code>ingestClientId</code> registry → dev-only <code>VERDICT_CALLBACK_URL</code> fallback.
        HMAC header <code>X-Verdict-Signature</code>.
      </p>

      {canManageClients && (
        <RegisterIngestClientForm onRegistered={onClientsChanged} />
      )}

      {error && <p className="error-banner">{error}</p>}

      <div className="ingest-dashboard__stats card-grid">
        <div className="stat-card">
          <span className="stat-label">Delivered</span>
          <strong>{fmt(counts.delivered)}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Failed</span>
          <strong>{fmt(counts.failed)}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Skipped</span>
          <strong>{fmt(counts.skipped)}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Mock received</span>
          <strong>{fmt(mockStats.total)}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Valid HMAC</span>
          <strong>{fmt(mockStats.signatureValid)}</strong>
        </div>
      </div>

      {chartData.length > 0 && (
        <div style={{ width: "100%", height: 220, marginTop: "1rem" }}>
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="verdict" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="#0ea5e9" name="Mock callbacks" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {delivery.registeredClients?.length > 0 && (
        <details className="ingest-dashboard__clients" style={{ marginTop: "1rem" }} open>
          <summary>Registered mail platforms ({delivery.registeredClients.length})</summary>
          <table className="data-table">
            <thead>
              <tr>
                <th>clientId</th>
                <th>Display name</th>
                <th>Default callback URL</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody>
              {delivery.registeredClients.map((client) => (
                <tr key={client.clientId}>
                  <td>
                    <code>{client.clientId}</code>
                  </td>
                  <td>{client.displayName}</td>
                  <td>{client.callbackUrl}</td>
                  <td>{client.isActive ? "yes" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {delivery.devFallbackCallbackUrl && (
        <p className="muted">Dev env fallback: {delivery.devFallbackCallbackUrl}</p>
      )}
      {templates.length > 0 && (
        <details className="ingest-dashboard__templates" style={{ marginTop: "1rem" }}>
          <summary>Phishing simulation templates ({templates.length})</summary>
          <ul className="muted">
            {templates.map((t) => (
              <li key={t.id}>
                <strong>{t.id}</strong> — {t.label} (expected: {t.expectedVerdict})
              </li>
            ))}
          </ul>
        </details>
      )}

      {mockCallbacks.length > 0 && (
        <div className="ingest-dashboard__mock-log" style={{ marginTop: "1rem" }}>
          <h4>Recent mock platform callbacks</h4>
          <table className="data-table">
            <thead>
              <tr>
                <th>Received</th>
                <th>externalMessageId</th>
                <th>Verdict</th>
                <th>HMAC</th>
              </tr>
            </thead>
            <tbody>
              {mockCallbacks.map((row) => (
                <tr key={`${row.receivedAt}-${row.payload?.reviewId}`}>
                  <td>{new Date(row.receivedAt).toLocaleTimeString()}</td>
                  <td>{row.payload?.externalMessageId || "—"}</td>
                  <td>{row.payload?.effectiveVerdict || row.payload?.verdict || "—"}</td>
                  <td>{row.signatureValid ? "valid" : "invalid"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {loading && <p className="muted">Updating verdict delivery metrics…</p>}
    </section>
  );
}
