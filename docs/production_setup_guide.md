# Production setup guide

## Goal

Prepare the app for production in a careful, repeatable way. Production should use remote managed MongoDB, PostgreSQL, Redis, and Kafka-compatible infrastructure, with secrets injected by deployment automation rather than committed to this repository.

---

## Backend

Use a process manager only when you are not running the API in containers. Check before installing:

```bash
# Check whether PM2 already exists; install it globally only if missing.
command -v pm2 >/dev/null 2>&1 || npm install -g pm2

# Start the Node API entrypoint if this host is running the API directly.
pm2 start backend/src/server.js --name suspicious-email-api
```

---

## Frontend

Build after dependencies are present (from repository root):

```bash
# Install frontend dependencies when needed, then build the production static bundle.
test -d frontend/node_modules || npm install --prefix frontend && npm run build --prefix frontend
```

Serve via nginx or static server

---

## Databases

- Use remote managed MongoDB for review documents in `prod`.
- Use remote managed PostgreSQL for chart statistics in `prod`.
- Enable authentication and network restrictions.
- Keep production credentials in a secret manager.

---

## Reverse Proxy (nginx)

- Route API traffic to the Node backend.
- Serve the frontend build from a static host, CDN, or nginx.

---

## Security

- Use environment variables or a secret manager.
- Enable firewall
- Restrict MongoDB and PostgreSQL access

---

## Monitoring

- Container/platform logs or `pm2 logs` (only when PM2 is used)
- Managed service dashboards for MongoDB/PostgreSQL/Redis/Kafka health

---

## Result

Single domain app:

- frontend + backend integrated

