/**
 * The only outbound HTTP calls from the browser.
 *
 * Isolated from the rest of the client so the rendering code has no idea how
 * requests work, and so the error contract is defined in exactly one place:
 * a non-2xx response becomes a thrown Error whose message is already
 * user-readable, because the server only ever returns messages that are.
 */

/**
 * POST JSON to one of this app's own routes and return the parsed body.
 *
 * @param {string} path e.g. '/api/hunt'
 * @param {object} body JSON-serializable request payload
 * @returns {Promise<object>} the parsed response body
 * @throws {Error} carrying the server's `error` message on a non-2xx response
 */
export async function post(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  // The server always replies with JSON, but a proxy or a crash can return HTML,
  // and res.json() would then throw. Swallow that so the real HTTP status is
  // what reaches the user.
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.error || `Request failed with status ${res.status}`);
  }

  return data;
}
