# Frontend — Suspicious Email Triage UI

This package is a **Create React App** project that implements the analyst-facing web interface.

## In normal language

You run this when you want the “website” part of the system: a place to submit suspicious email content, watch processing status update, read structured findings, optionally record an override, open analytics charts, and (in development) enable synthetic traffic for testing.

## Common commands

Run from the repository root:

```bash
# Install libraries only if frontend/node_modules is not already present.
test -d frontend/node_modules || npm install --prefix frontend

# Start the React development server.
npm start --prefix frontend

# Run the React tests.
npm test --prefix frontend

# Run frontend linting.
npm run lint --prefix frontend
```

## Environment variables

- `REACT_APP_API_URL` — optional for **production builds** only; dev `npm start` uses `setupProxy.js` (leave unset). See `docs/stack_guide_frontend_api.md`.
- `REACT_APP_DEPLOYMENT_ENV` — informational hint for UI defaults; capability flags still come from `GET /dev/features`.

See `frontend/.env.development` for a local default.

## Where to read more

- `frontend/src/README.md` — folder map.
- `docs/stack_guide_frontend_api.md` — API integration notes.

---

Below is the stock CRA boilerplate (kept for reference).

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.

### `npm test`

Launches the test runner.

### `npm run build`

Builds the app for production to the `build` folder.

### `npm run eject`

**Note: this is a one-way operation.**
