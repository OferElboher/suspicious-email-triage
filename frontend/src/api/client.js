/**
 * Thin fetch wrapper with bearer-token support for authenticated API calls.
 * Dev mode uses same-origin paths proxied to port 3000 (see setupProxy.js).
 */
import { buildNetworkError, resolveApiBase } from "../lib/apiBase";

const STORAGE_KEY = "triage_auth_token";

/** API origin for JSON fetch calls (empty string = CRA dev proxy). */
export function apiBase() {
  return resolveApiBase();
}

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

/** Low-level fetch with network error translation (Failed to fetch → actionable hint). */
async function request(path, { method = "GET", body, auth = true } = {}) {
  const url = `${apiBase()}${path}`;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers:
        body !== undefined
          ? auth
            ? authHeaders({ "Content-Type": "application/json" })
            : { "Content-Type": "application/json" }
          : auth
            ? authHeaders()
            : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw buildNetworkError(err, apiBase());
  }
  return parseResponse(res);
}

export async function postJson(path, body, { auth = true } = {}) {
  return request(path, { method: "POST", body, auth });
}

export async function patchJson(path, body) {
  return request(path, { method: "PATCH", body, auth: true });
}

export async function getJson(path, { auth = true } = {}) {
  return request(path, { method: "GET", auth });
}

/** PUT JSON with bearer token (used for /auth/preferences theme persistence). */
export async function putJson(path, body, { auth = true } = {}) {
  return request(path, { method: "PUT", body, auth });
}

/** DELETE with bearer token (used for /search/index clear). */
export async function deleteJson(path, { auth = true } = {}) {
  return request(path, { method: "DELETE", auth });
}
