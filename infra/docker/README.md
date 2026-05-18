# `infra/docker/` — local Docker Compose stack

## Files

- `docker-compose.yml` — MongoDB for reviews, PostgreSQL for chart statistics, Redis, Redpanda (Kafka API), Node API, Python Celery worker, Kafka dispatcher, shared log volume.

## Typical command

```bash
docker compose -f infra/docker/docker-compose.yml up --build
```
