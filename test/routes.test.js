/**
 * Tests for the assembled app: routing, the error contract, and static file
 * exposure.
 *
 * These run against a real listening server on an ephemeral port, because
 * Express's own behaviour (404s, middleware order, static resolution) only shows
 * up over HTTP. No test client library is needed since Node has global fetch.
 *
 * SCOPE LIMIT, AND IT MATTERS: every case here is chosen to fail or pass BEFORE
 * any model call happens. Nothing sends a valid { code, language } body, because
 * src/config.js loads the developer's real .env during `npm test` and a
 * successful-hunt test would spend money and hit the network. Testing the happy
 * path needs either a real model or injecting a fake client into createApp();
 * until one of those exists, the /api/hunt and /api/fix success paths are
 * uncovered.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app');

// One server for the whole file, closed in the teardown below.
let server;
let origin;

test.before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server?.close();
});

/** POST a body and return { status, json }. */
async function postJson(path, body) {
  const res = await fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

test('rejects a missing body on /api/hunt with 400', async () => {
  const { status, json } = await postJson('/api/hunt', {});
  assert.equal(status, 400);
  assert.match(json.error, /non-empty string/);
});

test('rejects a language outside the allowlist with 400', async () => {
  // The allowlist check is what keeps an arbitrary client string out of the
  // model prompt, so it is worth asserting at the HTTP boundary.
  const { status, json } = await postJson('/api/hunt', {
    code: 'x = 1',
    language: 'brainfuck',
  });
  assert.equal(status, 400);
  assert.match(json.error, /must be one of/);
});

test('rejects /api/fix with no bugs array with 400', async () => {
  const { status, json } = await postJson('/api/fix', {
    code: 'x = 1',
    language: 'python',
  });
  assert.equal(status, 400);
  assert.match(json.error, /non-empty array/);
});

test('rejects a bug array that is empty or not an array with 400', async () => {
  for (const bugs of [[], { severity: 'high' }, null]) {
    const { status } = await postJson('/api/fix', {
      code: 'x = 1',
      language: 'python',
      bugs,
    });
    assert.equal(status, 400, `expected 400 for bugs=${JSON.stringify(bugs)}`);
  }
});

test('every error response is JSON with an error field', async () => {
  // The client does res.json() on the failure path too, so a non-JSON body
  // would surface as a confusing parse error instead of the real message.
  const { json } = await postJson('/api/hunt', {});
  assert.equal(typeof json, 'object');
  assert.equal(typeof json.error, 'string');
  assert.ok(json.error.length > 0);
});

test('unknown routes are 404', async () => {
  const res = await fetch(`${origin}/api/nope`);
  assert.equal(res.status, 404);
});

test('serves the app shell at /', async () => {
  const res = await fetch(`${origin}/`);
  assert.equal(res.status, 200);
  const html = await res.text();
  // The module entry point is what the whole client hangs off.
  assert.match(html, /js\/main\.js/);
  assert.match(html, /type="module"/);
});

test('serves the client modules as executable JavaScript', async () => {
  // A wrong MIME type here stops ES module imports dead in the browser, and it
  // would not show up in a unit test.
  for (const file of ['js/main.js', 'js/api.js', 'js/render.js']) {
    const res = await fetch(`${origin}/${file}`);
    assert.equal(res.status, 200, `${file} did not load`);
    assert.match(
      res.headers.get('content-type') || '',
      /javascript/,
      `${file} had no JavaScript content type`
    );
  }
});

test('does not serve the API key or server source', async () => {
  // Two independent defences: the static root is ./public, and dotfiles are
  // denied. Either alone would be enough; this asserts both hold.
  for (const path of ['/.env', '/.env.example', '/../server.js', '/src/config.js']) {
    const res = await fetch(`${origin}${path}`);
    assert.equal(res.status, 404, `${path} was served`);
  }
});

test('the API key never appears in any served file', async () => {
  // Belt and braces. Reads the key the same way the app does, then confirms it
  // is not in the HTML or any client module. Skipped when unset.
  if (!process.env.GROQ_API_KEY) return;

  const files = ['/', '/js/main.js', '/js/api.js', '/js/render.js'];
  for (const file of files) {
    const body = await (await fetch(`${origin}${file}`)).text();
    assert.equal(
      body.includes(process.env.GROQ_API_KEY),
      false,
      `the key leaked into ${file}`
    );
  }
});
