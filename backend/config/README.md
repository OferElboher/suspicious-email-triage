# `backend/config/` — Django project configuration

This folder contains Django project-level settings and entrypoints.

## Files and subfolders

- `settings/` — environment-specific Django settings.
- `urls.py` — root URL routing for the Django project.
- `celery.py` — Celery application wiring for the Django path.
- `asgi.py` / `wsgi.py` — standard Django server entrypoints.

The Node/Express API in `backend/src/` is the main browser-facing API, while this folder documents the Django side of the repository.
