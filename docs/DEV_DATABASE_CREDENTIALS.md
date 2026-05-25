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

**Windows GUI clients:** step-by-step DBeaver, MongoDB Compass, and Redis Insight setup is in [windows_docker_databases_start_and_verify.md](windows_docker_databases_start_and_verify.md) and the linked tool guides in this folder.

**Auth tables** (`auth_users`, `auth_roles`, etc.) live in the same PostgreSQL database as chart statistics. User administration: [AUTHENTICATION_AND_RBAC.md](AUTHENTICATION_AND_RBAC.md). Reset auth and recreate admin: [dev_auth_tables_reset_and_admin_recovery.md](dev_auth_tables_reset_and_admin_recovery.md).

## Staging (`staging`) — remote

Staging is the soft rehearsal environment. It should feel like production, but it should not contain production data.

Typical remote shapes:

- MongoDB: `mongodb+srv://STAGING_USER:STAGING_PASS@staging.example.net/triage_staging`
- PostgreSQL stats: `postgres://STAGING_USER:STAGING_PASS@staging-postgres.example.net:5432/triage_stats`
- Redis: `rediss://:STAGING_PASS@staging-redis.example.net:6380/0`
- Kafka: `staging-kafka.example.net:9092`
- Deployment flag: `DEPLOYMENT_ENV=staging`

Store real values in your secret manager or private environment file. Do not commit them.

## Production (`prod`) — remote

Production uses remote managed services and production-grade secrets.

Typical remote shapes:

- MongoDB: `mongodb+srv://PROD_USER:PROD_PASS@prod.example.net/triage`
- PostgreSQL stats: `postgres://PROD_USER:PROD_PASS@prod-postgres.example.net:5432/triage_stats`
- Redis: `rediss://:PROD_PASS@prod-redis.example.net:6380/0`
- Kafka: `prod-kafka.example.net:9092`
- Deployment flag: `DEPLOYMENT_ENV=prod`

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
