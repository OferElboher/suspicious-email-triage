# `infra/docker/` — local Docker Compose stack

## Files

- `docker-compose.yml` — MongoDB for reviews, PostgreSQL for chart statistics, Redis, Redpanda (Kafka API), Node API, Python Celery worker, Kafka dispatcher, shared log volume.

## Typical command

From the repository root:

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up --build
```

## Windows GUI database clients

To connect DBeaver, MongoDB Compass, or Redis Insight on Windows 11 to these containers, see `docs/windows_docker_databases_start_and_verify.md`.
