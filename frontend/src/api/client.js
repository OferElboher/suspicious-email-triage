/**
 * Thin fetch wrapper with bearer-token support for authenticated API calls.
 */
const STORAGE_KEY = "triage_auth_token";

const base = () => process.env.REACT_APP_API_URL || "http://localhost:3000";

export function getStoredToken() {
  return localStorage.getItem(STORAGE_KEY);
}

export function setStoredToken(token) {
  if (token) {
    localStorage.setItem(STORAGE_KEY, token);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function authHeaders(extra = {}) {
  const token = getStoredToken();
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function parseResponse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.status = res.status;
    err.body = data;
    if (res.status === 401) {
      err.unauthorized = true;
    }
    throw err;
  }
  return data;
}

export async function postJson(path, body, { auth = true } = {}) {
  const res = await fetch(`${base()}${path}`, {
    method: "POST",
    headers: auth ? authHeaders({ "Content-Type": "application/json" }) : { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseResponse(res);
}

export async function patchJson(path, body) {
  const res = await fetch(`${base()}${path}`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  return parseResponse(res);
}

export async function getJson(path, { auth = true } = {}) {
  const res = await fetch(`${base()}${path}`, {
    headers: auth ? authHeaders() : {},
  });
  return parseResponse(res);
}
