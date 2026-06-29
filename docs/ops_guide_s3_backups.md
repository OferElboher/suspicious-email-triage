# Amazon S3 database backups

This guide explains how the Suspicious Email Triage project stores **off-site PostgreSQL backups** in **Amazon S3** (or a **mock S3 container** in local dev). Backups complement Docker named volumes — they let you recover statistics and auth metadata even if a laptop disk fails.

**Audience:** developers new to S3, SOC leads planning disaster recovery, and DevOps engineers wiring staging/production.

**Related:** [roadmap_tbd.md](roadmap_tbd.md) §1.5 backups, [stack_guide_staging_production_services.md](stack_guide_staging_production_services.md), [ops_guide_secrets_management.md](ops_guide_secrets_management.md).

---

## Why S3 for backups?

Docker **named volumes** (`postgres-data`, `mongo-data`, …) survive container rebuilds on the same machine, but they do not protect against:

- Ransomware or disk corruption on the host
- Accidental `docker volume rm`
- Need to clone production statistics into a staging environment

**Amazon S3** is durable object storage: upload a file once, AWS replicates it across facilities. Lifecycle rules can move old backups to cheaper storage (Glacier) or delete them after N days.

This project implements a **logical JSON backup** of PostgreSQL tables used for auth and chart statistics — not a full `pg_dump` binary (the backend container does not ship PostgreSQL client tools). MongoDB and Neo4j remain on volume backups for now; extend the same S3 pattern later.

---

## Architecture (dev vs staging/prod)

| Layer | Dev | Staging / production |
|-------|-----|----------------------|
| **Provider** | `BACKUP_PROVIDER=mock-aws` | `BACKUP_PROVIDER=aws` |
| **Endpoint** | `http://mock-s3:4568` (Docker) | Default AWS S3 HTTPS |
| **Bucket** | `triage-dev-backups` | `triage-staging-backups` / `triage-prod-backups` |
| **Credentials** | Fake keys in code (mock only) | IAM role on ECS/EKS or keys in AWS Secrets Manager |
| **SDK** | `@aws-sdk/client-s3` with custom `endpoint` | Same SDK, real region |

```mermaid
flowchart LR
  API[Node backend] --> BS[backupService.js]
  BS --> PG[(PostgreSQL triage_stats)]
  BS --> SP[s3BackupProvider.js]
  SP --> Mock[mock-s3 container dev]
  SP --> S3[Amazon S3 staging/prod]
```

**Pattern:** factory abstraction (`s3BackupProvider.js`) mirrors `secretsProvider.js` — one code path, environment selects mock vs cloud.

---

## What gets backed up?

Each backup file is JSON at key `postgres/logical-<timestamp>.json`:

| Section | Contents |
|---------|----------|
| `authUsers` | Email, roles, active flag, theme — **no password hashes** (security) |
| `reviewStatsEvents` | Up to 5,000 most recent rows from `review_stats_events` |
| `summary` | Total event count and user count |

Password hashes stay out of S3 objects so backup files are safer to share with analysts. Full auth restore still uses bootstrap admin flow or Django admin.

---

## REST API (admin permission)

**Permission:** `ops.backups` (included in `admin` role only).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/ops/backups/status` | Provider mode, bucket name, endpoint URL |
| GET | `/ops/backups` | List recent object keys under `postgres/` |
| POST | `/ops/backups/run` | Build JSON snapshot and upload to S3 |

Example (replace `<jwt>` — see [auth_guide_obtain_jwt.md](auth_guide_obtain_jwt.md)):

```bash
TOKEN="<jwt-from-admin-login>"

curl -sS http://localhost:3000/ops/backups/status \
  -H "Authorization: Bearer ${TOKEN}"

curl -sS -X POST http://localhost:3000/ops/backups/run \
  -H "Authorization: Bearer ${TOKEN}"
```

---

## Environment variables

Committed in `backend/.env.dev` (non-secret metadata):

```bash
BACKUP_PROVIDER=mock-aws
BACKUP_S3_ENDPOINT=http://mock-s3:4568
BACKUP_S3_BUCKET=triage-dev-backups
```

Staging/prod profiles set `BACKUP_PROVIDER=aws`, real bucket name, and `AWS_REGION`. IAM credentials come from the instance role or secrets bundle — **never commit access keys to Git**.

Set `BACKUP_PROVIDER=disabled` to turn off backup endpoints (returns HTTP 503).

---

## Mock S3 container (dev only)

**Service:** `mock-s3` in `infra/docker/docker-compose.yml`  
**Port:** `4568` on localhost  
**Implementation:** `infra/mock-aws-s3/server.js` — in-memory `Map` storage, path-style PUT/GET/List compatible with AWS SDK.

Start with the full stack:

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d mock-s3 backend
```

---

## Tests

| File | Coverage |
|------|----------|
| `backend/__tests__/opsApi.test.js` | `/ops/backups/*` routes with mocked provider |
| Integration guardrails | `BACKUP_PROVIDER` in `.env.dev` |

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — backup API tests</p>

```bash
cd ~/suspicious-email-triage/backend
npm test -- --watchAll=false --testPathPattern=opsApi
```

</div>

---

## Security note

Documentation uses placeholders only. Real S3 bucket names in your AWS account and IAM policies are operational details — do not paste gitignored secrets or production access keys into markdown.
