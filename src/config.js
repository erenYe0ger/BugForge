/**
 * Configuration and policy constants.
 *
 * Everything environment-dependent is read here, once, at load time. No other
 * module touches `process.env` directly, so there is a single place to look for
 * "where does this value come from" and a single place to add a new setting.
 */

// Loading dotenv is a side effect of importing this module, which is
// intentional. dotenv does not overwrite variables that already exist, so a
// real environment variable always wins over the .env file. That is what makes
// deploys, CI, and the tests in test/groq.test.js able to override values.
require('dotenv').config();

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT) || 3000;

// Upstream endpoint. Overridable so tests can point it at a local mock, and so
// this can be pointed at a proxy in some other deployment.
const GROQ_URL =
  process.env.GROQ_URL || 'https://api.groq.com/openai/v1/chat/completions';

// The secret. Read here, used only in src/groq.js, never sent to the browser,
// never logged, never returned in a response.
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

// Ceiling on a single model call. Reasoning models run long; this exists to stop
// a request hanging forever, not to describe a typical duration.
const TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS) || 120000;

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------
// IMPORTANT: a Groq key is only entitled to the models on that account's plan.
// `openai/gpt-oss-120b` is the strongest coding model broadly available, but it
// is not on every key. Verify what yours can reach with:
//
//   curl https://api.groq.com/openai/v1/models \
//     -H "Authorization: Bearer $GROQ_API_KEY"
//
// A model id the key cannot reach comes back from Groq as a 404 with
// code model_not_found, which src/groq.js turns into a 502. That is the single
// most common misconfiguration in this app.
const HUNTER_MODEL = process.env.HUNTER_MODEL || 'openai/gpt-oss-120b';

// Defaults to the Hunter's model. Set separately to give the Coder a bigger one.
const CODER_MODEL = process.env.CODER_MODEL || HUNTER_MODEL;

// ---------------------------------------------------------------------------
// Input policy
// ---------------------------------------------------------------------------

// Languages the UI offers and the server accepts. This doubles as the input
// validator: an unknown language is a 400, so the value interpolated into the
// model prompt can never be an arbitrary string from the client.
const LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'go',
  'java',
  'csharp',
  'php',
  'ruby',
  'rust',
];

// Upper bound on submitted source in characters. Stops a pasted minified bundle
// or an entire repository in one field.
const MAX_CODE_CHARS = 200000;

// The only severity values the UI knows how to colour. Anything else is
// downgraded by validateBugs rather than rejected.
const SEVERITIES = ['critical', 'high', 'medium', 'low'];

module.exports = {
  PORT,
  GROQ_URL,
  GROQ_API_KEY,
  TIMEOUT_MS,
  HUNTER_MODEL,
  CODER_MODEL,
  LANGUAGES,
  MAX_CODE_CHARS,
  SEVERITIES,
};
