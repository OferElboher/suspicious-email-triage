/**
 * Thin fetch wrapper: base URL from CRA env, JSON helpers.
 * `REACT_APP_API_URL` selects the Node API host; defaults to local dev port 3000.
 */
const base = () => process.env.REACT_APP_API_URL || "http://localhost:3000";

/**
 * POST JSON to `{API}{path}`; throws Error with `.status` when response is not OK.
 * @param {string} path absolute path beginning with `/`
 * @param {unknown} body JSON-serializable payload
 */
export async function postJson(path, body) {
  const res = await fetch(`${base()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

/**
 * GET JSON from `{API}{path}`; throws Error with `.status` when response is not OK.
 * @param {string} path absolute path beginning with `/`
 */
export async function getJson(path) {
  const res = await fetch(`${base()}${path}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.status = res.status;
    throw err;
  }
  return data;
}
