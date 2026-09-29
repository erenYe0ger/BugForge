/**
 * The single outbound HTTP call to the model provider.
 *
 * This is the only module in the app that performs network I/O. Keeping it
 * isolated means the routes, validation, and parsing layers can all be tested
 * without a network, and there is exactly one place where the API key is used.
 *
 * Upstream is Groq's OpenAI-compatible chat completions endpoint, so the request
 * shape is `{ model, messages, temperature, max_tokens }` and the reply is read
 * from `choices[0].message.content`.
 */

const { GROQ_URL, GROQ_API_KEY, TIMEOUT_MS } = require('./config');
const { HttpError } = require('./errors');

/**
 * Build the auth header, failing loudly if the key is absent.
 *
 * The key comes from the environment and is used only here. It is never logged,
 * never returned in a response, and never sent to the browser.
 *
 * @returns {{Authorization: string}}
 * @throws {HttpError} 500 with a setup hint when the key is missing
 */
function buildAuthHeaders() {
  if (!GROQ_API_KEY) {
    throw new HttpError(
      500,
      'GROQ_API_KEY is not set. Copy .env.example to .env and add your key.'
    );
  }
  return { Authorization: `Bearer ${GROQ_API_KEY}` };
}

/**
 * POST a chat completion and return the assistant's text.
 *
 * Failures become 502 with the upstream status and a truncated body, so the
 * browser can show something actionable: an unreachable model id, a rate limit,
 * a revoked key. Forwarding a slice of the upstream body is safe because those
 * messages describe the request and never echo the key back.
 *
 * The response is read with optional chaining throughout. An unexpected shape
 * upstream should surface as "no fixed code" in the route rather than a
 * TypeError stack.
 *
 * @param {Array<{role: string, content: string}>} messages
 * @param {string} model a model id the key is entitled to
 * @returns {Promise<string|undefined>} the assistant message content
 * @throws {HttpError} 500 for a missing key, 502 for any upstream failure
 */
async function callGroq(messages, model) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAuthHeaders(),
    },
    body: JSON.stringify({
      model,
      messages,
      // Low temperature on purpose. Both tasks have a correct answer, so a
      // higher temperature only adds noise.
      temperature: 0.2,
      // Reasoning models count their thinking against this budget. Too low and
      // the Coder returns a truncated file.
      max_tokens: 8192,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 500);
    throw new HttpError(502, `Groq API ${res.status}: ${detail}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content;
}

module.exports = { callGroq, buildAuthHeaders };
