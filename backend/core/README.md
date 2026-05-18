# `backend/core/` — Django core app

This folder contains a Django app that models an alternate or legacy Python API/worker path.

## What lives here

- Django views and URLs for simple API-style endpoints.
- Kafka producer/consumer helpers used by the Django path.
- Celery tasks and tests for Python-side background processing.

The current React UI primarily talks to the Node/Express API in `backend/src/`, but this folder is kept documented because it is real project code and may be used during Python/Django integration work.
