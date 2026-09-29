/**
 * Tests for src/groq.js, the only outbound network call in the app.
 *
 * `fetch` is stubbed rather than mocked with a library, so there is no new
 * dependency. Environment variables are set BEFORE src/config.js is required,
 * because config reads them once at load time. dotenv does not overwrite
 * variables that already exist, so these values win over any real .env and the
 * test never touches the developer's actual key.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

process.env.GROQ_URL = 'https://model.invalid/v1/chat/completions';
process.env.GROQ_API_KEY = 'test-key-not-real';
process.env.UPSTREAM_TIMEOUT_MS = '5000';

const { callGroq, buildAuthHeaders } = require('../src/groq');

/**
 * Replace global fetch for the duration of one test.
 * @param {object} behavior
 * @param {number} [behavior.status] HTTP status to return
 * @param {string} [behavior.body] raw response body
 * @param {object} [behavior.json] response body as an object
 * @returns {Array<object>} the captured request arguments
 */
function stubFetch({ status = 200, body = '', json }) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
      json: async () => (json !== undefined ? json : JSON.parse(body)),
    };
  };
  return calls;
}

test.afterEach(() => {
  delete globalThis.fetch;
});

test('buildAuthHeaders sends the key as a bearer token', () => {
  assert.deepEqual(buildAuthHeaders(), { Authorization: 'Bearer test-key-not-real' });
});

test('callGroq returns the assistant message content', async () => {
  stubFetch({
    json: { choices: [{ message: { content: 'hello' } }] },
  });
  assert.equal(await callGroq([{ role: 'user', content: 'hi' }], 'm'), 'hello');
});

test('callGroq posts the model id, messages, and auth header', async () => {
  const calls = stubFetch({ json: { choices: [{ message: { content: 'ok' } }] } });
  await callGroq([{ role: 'user', content: 'hi' }], 'openai/gpt-oss-120b');

  const { url, options } = calls[0];
  assert.equal(url, 'https://model.invalid/v1/chat/completions');
  assert.equal(options.method, 'POST');
  assert.equal(options.headers.Authorization, 'Bearer test-key-not-real');

  const body = JSON.parse(options.body);
  assert.equal(body.model, 'openai/gpt-oss-120b');
  assert.deepEqual(body.messages, [{ role: 'user', content: 'hi' }]);
  assert.equal(body.temperature, 0.2);
});

test('callGroq reports an unreachable model as a 502 with the upstream body', async () => {
  // This is the model_not_found case. The message has to reach the user intact,
  // otherwise the only clue is that something failed.
  stubFetch({
    status: 404,
    body: '{"error":{"code":"model_not_found","message":"no such model"}}',
  });

  await assert.rejects(
    () => callGroq([], 'bogus-model'),
    (err) => {
      assert.equal(err.status, 502);
      assert.match(err.message, /Groq API 404/);
      assert.match(err.message, /model_not_found/);
      return true;
    }
  );
});

test('callGroq reports a rate limit as a 502', async () => {
  stubFetch({ status: 429, body: 'Rate limit reached' });
  await assert.rejects(
    () => callGroq([], 'm'),
    (err) => err.status === 502 && /Groq API 429/.test(err.message)
  );
});

test('callGroq caps the forwarded error detail', async () => {
  // An unbounded upstream body would bloat every error response.
  stubFetch({ status: 500, body: 'x'.repeat(5000) });
  await assert.rejects(() => callGroq([], 'm'), (err) => {
    assert.ok(err.message.length < 700, `message was ${err.message.length} chars`);
    return true;
  });
});

test('callGroq returns undefined for an unexpected response shape', async () => {
  // Routes turn this into their own clear 502, rather than it crashing here.
  stubFetch({ json: { choices: [] } });
  assert.equal(await callGroq([], 'm'), undefined);
});

test('buildAuthHeaders fails with a setup hint when the key is missing', () => {
  // Run in a child process whose cwd has no .env, because dotenv resolves
  // .env relative to process.cwd() and would otherwise re-inject the developer's
  // real key the moment it was removed from the environment. This also tests
  // the genuine startup path rather than a doctored module cache.
  const script = `
    const { buildAuthHeaders } = require(${JSON.stringify(require.resolve('../src/groq'))});
    try {
      buildAuthHeaders();
      console.log('NO_THROW');
    } catch (err) {
      console.log(err.status + '|' + err.message);
    }
  `;

  const out = execFileSync(process.execPath, ['-e', script], {
    // cwd is a directory with no .env, so dotenv has nothing to re-inject.
    cwd: os.tmpdir(),
    // The child would otherwise inherit the GROQ_API_KEY this very file set at
    // the top. Blanked rather than deleted, so the key is falsy either way.
    env: { ...process.env, GROQ_API_KEY: '' },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();

  const [status, ...rest] = out.split('|');
  assert.notEqual(out, 'NO_THROW', 'expected buildAuthHeaders to throw');
  assert.equal(status, '500');
  assert.match(rest.join('|'), /GROQ_API_KEY is not set/);
});
