# Local dev databases and remote staging/prod credentials

This guide keeps the environments gentle and predictable:

- **dev** uses local services/databases, normally through Docker Compose.
- **staging** and **prod** use remote managed services and real credentials.

The goal is to let developers work without touching shared data, while still making it clear where staging/prod credentials belong when the system is promoted.

## Development (`dev`) — local only

In `dev`, please keep the databases local. The compose network gives services friendly names, so containers can talk to each other without remote hostnames.

### Local dev values

- MongoDB: `MONGO_URI=mongodb://mongo:27017/triage`
- PostgreSQL stats: `STATISTICS_PG_URL=postgres://triage:triage@postgres:5432/triage_stats`
- Redis for Celery: `CELERY_BROKER_URL=redis://redis:6379/0`
- Redis result backend: `CELERY_RESULT_BACKEND=redis://redis:6379/1`
- Kafka-compatible broker: `KAFKA_BROKERS=redpanda:9092`
- Deployment flag: `DEPLOYMENT_ENV=dev`

MongoDB stores review request documents and analysis results. PostgreSQL stores compact chart statistics. From the host machine, MongoDB is mapped to `localhost:27018`, PostgreSQL is mapped to `localhost:5432`, and Redpanda’s Kafka API is mapped to `localhost:19092`. Inside Docker, use the service names above.

**Windows GUI clients:** step-by-step DBeaver, MongoDB Compass, and Redis Insight setup is in [stack_guide_windows_docker_databases.md](stack_guide_windows_docker_databases.md) and the linked tool guides in this folder.

**Auth tables** (`auth_users`, `auth_roles`, etc.) live in the same PostgreSQL database as chart statistics. User administration: [auth_guide_rbac.md](auth_guide_rbac.md). Reset auth and recreate admin: [auth_guide_dev_auth_recovery.md](auth_guide_dev_auth_recovery.md).

## Staging (`staging`) — remote

Staging is the soft rehearsal environment. It should feel like production, but it should not contain production data.

Set connection strings in **gitignored** `backend/staging.secrets` (copy from `backend/staging.secrets.example`). Profile metadata lives in `backend/.env.staging` (hostnames only).

| Variable | Where to set | Notes |
|----------|--------------|-------|
| `MONGO_URI` | `staging.secrets` | Atlas or DocumentDB connection string |
| `STATISTICS_PG_URL` | `staging.secrets` | RDS PostgreSQL URL |
| `CELERY_BROKER_URL` | `staging.secrets` | ElastiCache Redis (TLS) |
| `KAFKA_BROKERS` | `.env.staging` | MSK bootstrap brokers |
| `DEPLOYMENT_ENV` | `.env.staging` | Must be `staging` |

Store real values in AWS Secrets Manager (`triage/staging`) or your private secrets file — never commit them.

## Production (`prod`) — remote

Production uses remote managed services and production-grade secrets.

Same pattern as staging: **`backend/prod.secrets`** (from `backend/prod.secrets.example`) + **`backend/.env.prod`** for non-secret hostnames. AWS bundle id: `triage/prod`.

| Variable | Where to set |
|----------|--------------|
| `MONGO_URI`, `STATISTICS_PG_URL`, `CELERY_*`, passwords | `prod.secrets` → Secrets Manager |
| `KAFKA_BROKERS`, `APP_PUBLIC_URL`, flags | `.env.prod` |
| `DEPLOYMENT_ENV` | `prod` |

Production credentials should only be available to production deployment automation and approved operators.

## Gentle sanity checks

Before changing a connection string, check what is already set:

```bash
# Shows whether a local shell variable already exists; no installation happens here.
test -n "${MONGO_URI:-}" && echo "MONGO_URI is already set" || echo "MONGO_URI is not set"
```

Expected output is one of:

```text
MONGO_URI is already set
```

or:

```text
MONGO_URI is not set
```

## Safety checklist

- Keep `dev` local.
- Use remote databases only for `staging` and `prod`.
- Never commit real credentials.
- Rotate credentials if they appear in screenshots, tickets, or chat logs.
