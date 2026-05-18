# Image build and deployment

Deployment is the calm handoff from code to running services. The same source tree can run as local `dev`, remote `staging`, or remote `prod`; the main difference is which infrastructure endpoints and secrets are supplied.

## Storage responsibilities

- MongoDB stores review request documents, current status, analysis output, and overrides.
- PostgreSQL stores compact chart/statistics events.
- Redis stores Celery broker/result data and local dev state.
- Kafka/Redpanda carries ingest events between the API and async workers.

This split keeps chart rendering from scanning a large MongoDB review history.

## Build images

```bash
# Check Docker/Compose first; build only if the tools are present.
docker compose version >/dev/null 2>&1 && \
  docker compose -f infra/docker/docker-compose.yml build
```

During image build, no real staging/prod secrets should be present. Secrets are runtime configuration, not image content.

## Run local dev

```bash
# Local dev uses local MongoDB, PostgreSQL, Redis, and Redpanda from Compose.
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up --build
```

## Staging/prod deployment shape

For staging and production, inject remote values such as:

- `MONGO_URI` for remote review storage.
- `STATISTICS_PG_URL` for remote PostgreSQL chart statistics.
- `CELERY_BROKER_URL` and `CELERY_RESULT_BACKEND` for remote Redis or compatible broker/backend.
- `KAFKA_BROKERS` for the remote Kafka-compatible service.

Use a secret manager or CI/CD secret store rather than committing those values.

## Dev reset reminder

The `/dev/reset-local-state` route and UI button are local-development tools only. They clear local MongoDB reviews, truncate local PostgreSQL stats, flush Redis queues/state, recreate the local Kafka topic, and turn off simulation.
