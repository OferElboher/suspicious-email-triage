# `backend/` — Node.js services

This folder contains the **Express API** and optional **BullMQ worker** implementations used by the triage system.

## What runs from here

- API entry: `src/server.js` (Docker CMD points here).
- Optional worker entry: `src/worker.js`.

## Configuration

- Active local profile: `backend/.env` (created as a dev copy).
- Default tracked profile: `backend/.env.dev`.
- Staging sample profile: `backend/.env.staging`.
- Production sample profile: `backend/.env.prod`.
- Private overrides may use `backend/.env` or `ENV_FILE=/path/to/file`; keep real secrets out of git.

## Tests & lint

- `npm run lint`
- `npm test`

See `backend/src/README.md` for a folder-by-folder map.
