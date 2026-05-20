# FRONTEND_BACKEND_INTEGRATION.md

## Goal

Connect React frontend to Node backend API.

### In normal language

This guide is about the “plumbing” between the browser and the API: which URLs to call, how to configure the base URL for different machines, and how to avoid common pitfalls like CORS misconfiguration during local development.

---

## Step 1 — API call example

```javascript
fetch("http://localhost:3000/health")
  .then(res => res.json())
```

---

## Step 2 — Use env variable

```javascript
fetch(`${process.env.REACT_APP_API_URL}/health`)
```

---

## Step 3 — Handle CORS (backend)

The backend already declares `cors` in `backend/package.json`. If you are setting up from scratch, check first and install only when it is missing:

```bash
# Check whether backend dependencies are already installed (from repository root).
test -d backend/node_modules || npm install --prefix backend

# Check whether the cors package can be resolved by Node.
npm exec --prefix backend -- node -e "require.resolve('cors'); console.log('cors already installed')" || \
  npm install cors --prefix backend
```

Use:

```javascript
const cors = require('cors');
app.use(cors());
```

---

## Step 4 — Verify

- Open browser
- Check Network tab
- Ensure 200 response

---

## Common Issues

- CORS blocked
- Wrong port
- Backend not running

