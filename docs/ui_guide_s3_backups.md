# S3 backups UI — Admin panel for off-site PostgreSQL snapshots

This guide explains the **S3 database backups** panel in the React app: where to find it, what each number means, and which API routes power the display.

**Pattern:** operations dashboard embedded in the Admin sub-window — same permission model as backup REST routes (`ops.backups`).

**Related:** [ops_guide_s3_backups.md](ops_guide_s3_backups.md) (backend + S3 architecture), [auth_guide_rbac.md](auth_guide_rbac.md) (permissions).

---

## Where to open it

1. Sign in with a user that has the **admin** role (includes `ops.backups`).
2. Click the **User administration** icon in the header (shield + person).
3. URL hash: `#admin`.
4. Scroll below the Django admin gateway card to **S3 database backups**.

If you do not see the panel, your JWT lacks `ops.backups` — only administrators can list or trigger backups.

---

## What the panel shows

| UI section | API field | Meaning |
|------------|-----------|---------|
| Provider | `provider` | `mock-aws` in dev, `aws` in staging/production |
| Bucket | `bucket` | S3 bucket name from `BACKUP_S3_BUCKET` |
| Endpoint | `endpoint` | Mock HTTP URL or regional AWS S3 HTTPS base |
| Objects in bucket | `summary.objectCount` | Count of keys returned (max 50 queried) |
| Total stored size | `summary.totalSizeLabel` | Sum of object sizes (human-readable) |
| Latest backup | `summary.latestModified` | Newest object timestamp in the sample |
| Recent objects table | `recentObjects[]` | Key, byte size, last modified |

**Technology:** `S3BackupsPanel.jsx` uses `getJson("/ops/backups/stats")` on mount and after each manual backup. No WebSocket — refresh is explicit to keep API load predictable in all environments.

---

## Actions

| Button | HTTP | Effect |
|--------|------|--------|
| **Refresh** | `GET /ops/backups/stats` | Reloads counts and object table |
| **Run backup now** | `POST /ops/backups/run` | Builds PostgreSQL JSON snapshot and uploads to S3 |

After a successful run, a status line shows the new object key and byte size.

---

## Sample display (development)

When `mock-s3` is running and one backup exists, you might see:

```
Provider: mock-aws
Bucket: triage-dev-backups
Endpoint: http://mock-s3:4568

Objects in bucket: 1
Total stored size: 12.4 KB
Latest backup: 6/1/2026, 12:00:00 PM

Recent backup objects
  postgres/logical-2026-06-01T12-00-00-000Z.json   12680 B   6/1/2026, 12:00:00 PM
```

In staging/production the provider reads `aws` and the endpoint shows the regional S3 URL; bucket names come from environment profiles.

---

## Files reference

| File | Role |
|------|------|
| `frontend/src/components/S3BackupsPanel.jsx` | Panel UI |
| `frontend/src/views/AdminView.jsx` | Mounts panel when `ops.backups` granted |
| `backend/src/backups/backupStats.js` | Aggregates list for `/ops/backups/stats` |
| `backend/src/backups/backupService.js` | Builds JSON payload on run |
| `backend/src/backups/s3BackupProvider.js` | S3 SDK factory (mock vs AWS) |

---

## Tests

```bash
cd ~/suspicious-email-triage/frontend
npm test -- --watchAll=false --testPathPattern=S3BackupsPanel
```

---

## Command you can run (this guide) {#run-one-command}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — open Admin backups after sign-in</p>

```bash
cd ~/suspicious-email-triage
# Browse http://localhost:3000/#admin as admin user
```

</div>
