/**
 * S3 backup usage statistics — aggregates object list for the Admin backups UI.
 *
 * Pattern: read-only snapshot built from listBackupObjects (capped at 50 keys).
 * Technology: @aws-sdk/client-s3 via s3BackupProvider.js; no email or secret payloads.
 */
const {
  backupProviderMode,
  backupProviderStatus,
  listBackupObjects,
} = require("./s3BackupProvider");

/**
 * Format byte count for human-readable UI labels.
 * @param {number} bytes
 * @returns {string}
 */
function formatBackupSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "—";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Build usage snapshot for GET /ops/backups/stats (Admin S3 backups panel).
 * @returns {Promise<object>}
 */
async function getBackupUsageSnapshot() {
  const status = backupProviderStatus();
  const mode = backupProviderMode();

  if (mode === "disabled") {
    return {
      ...status,
      summary: null,
      recentObjects: [],
    };
  }

  const listed = await listBackupObjects({ prefix: "postgres/", maxKeys: 50 });
  const items = listed.items || [];
  const totalSizeBytes = items.reduce((sum, entry) => sum + (entry.size || 0), 0);
  const latest = items[0] || null;
  const oldest = items.length > 0 ? items[items.length - 1] : null;

  return {
    ...status,
    prefix: listed.prefix,
    summary: {
      objectCount: items.length,
      totalSizeBytes,
      totalSizeLabel: formatBackupSize(totalSizeBytes),
      latestKey: latest?.key || null,
      latestModified: latest?.lastModified || null,
      oldestModified: oldest?.lastModified || null,
    },
    recentObjects: items.slice(0, 20),
  };
}

module.exports = { getBackupUsageSnapshot, formatBackupSize };
