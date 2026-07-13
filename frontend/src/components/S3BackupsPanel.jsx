/**
 * S3 database backup statistics panel — Admin sub-window.
 *
 * Pattern: polls GET /ops/backups/stats; manual backup via POST /ops/backups/run.
 * Technology: React state + shared API client; permission ops.backups (admin role).
 */
import { useCallback, useEffect, useState } from "react";
import { getJson, postJson } from "../api/client";
import HoverHelp from "./HoverHelp";

/** Format ISO timestamp for table display. */
function formatTimestamp(iso) {
  if (!iso) {
    return "—";
  }
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * Displays S3 backup provider status, usage totals, and recent objects.
 * @param {object} props
 * @param {boolean} props.enabled — parent already verified ops.backups permission
 */
export default function S3BackupsPanel({ enabled = true }) {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [runMessage, setRunMessage] = useState("");

  const refresh = useCallback(async () => {
    if (!enabled) {
      return;
    }
    setLoading(true);
    try {
      const data = await getJson("/ops/backups/stats");
      setSnapshot(data);
      setError("");
    } catch (err) {
      setError(err.message || "Backup statistics unavailable");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  const runBackup = async () => {
    setRunning(true);
    setRunMessage("");
    try {
      const result = await postJson("/ops/backups/run", {});
      setRunMessage(
        `Uploaded ${result.key} (${result.size} bytes) at ${formatTimestamp(result.createdAt)}`
      );
      await refresh();
    } catch (err) {
      setRunMessage(err.message || "Backup run failed");
    } finally {
      setRunning(false);
    }
  };

  if (!enabled) {
    return null;
  }

  const summary = snapshot?.summary;

  return (
    <section className="card s3-backups-panel" data-testid="s3-backups-panel">
      <HoverHelp text="Off-site PostgreSQL logical backups in Amazon S3 (mock-s3 in dev, real S3 in staging/prod). See ops_guide_s3_backups.md.">
        <h2>S3 database backups</h2>
      </HoverHelp>

      <p className="muted">
        Logical JSON snapshots of PostgreSQL auth metadata and review statistics events are stored in
        object storage so dev, staging, and production environments can recover chart and user data
        independently of local Docker volumes.
      </p>

      <div className="toolbar s3-backups-panel__toolbar">
        <button type="button" onClick={() => refresh()} disabled={loading}>
          {loading ? "…" : "Refresh"}
        </button>
        <button type="button" onClick={() => runBackup()} disabled={running || loading}>
          {running ? "Uploading…" : "Run backup now"}
        </button>
      </div>

      {error && <p className="status-failed">{error}</p>}
      {runMessage && <p className="muted s3-backups-panel__run-msg">{runMessage}</p>}

      {snapshot && (
        <>
          <dl className="s3-backups-panel__meta">
            <div>
              <dt>Provider</dt>
              <dd>{snapshot.provider || "—"}</dd>
            </div>
            <div>
              <dt>Bucket</dt>
              <dd>{snapshot.bucket || "—"}</dd>
            </div>
            <div>
              <dt>Endpoint</dt>
              <dd className="s3-backups-panel__mono">{snapshot.endpoint || "—"}</dd>
            </div>
            <div>
              <dt>Enabled</dt>
              <dd>{snapshot.enabled ? "yes" : "no"}</dd>
            </div>
          </dl>

          {summary && (
            <div className="s3-backups-panel__stats">
              <div className="s3-backups-panel__stat">
                <span className="s3-backups-panel__stat-value">{summary.objectCount}</span>
                <span className="muted">Objects in bucket</span>
              </div>
              <div className="s3-backups-panel__stat">
                <span className="s3-backups-panel__stat-value">{summary.totalSizeLabel}</span>
                <span className="muted">Total stored size</span>
              </div>
              <div className="s3-backups-panel__stat">
                <span className="s3-backups-panel__stat-value">
                  {formatTimestamp(summary.latestModified)}
                </span>
                <span className="muted">Latest backup</span>
              </div>
            </div>
          )}

          <h3>Recent backup objects</h3>
          {!summary || summary.objectCount === 0 ? (
            <p className="muted">No backup objects yet — click Run backup now to upload the first snapshot.</p>
          ) : (
            <div className="s3-backups-panel__table-wrap">
              <table className="s3-backups-panel__table">
                <thead>
                  <tr>
                    <th>Object key</th>
                    <th>Size</th>
                    <th>Last modified</th>
                  </tr>
                </thead>
                <tbody>
                  {(snapshot.recentObjects || []).map((obj) => (
                    <tr key={obj.key}>
                      <td className="s3-backups-panel__mono">{obj.key}</td>
                      <td>{obj.size != null ? `${obj.size} B` : "—"}</td>
                      <td>{formatTimestamp(obj.lastModified)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
