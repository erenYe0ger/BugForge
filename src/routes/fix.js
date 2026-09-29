/**
 * POST /api/fix — the Coder agent.
 *
 * Request  { code, language, bugs }
 * Response { code: "<the whole rewritten file>" }
 *
 * Like the hunt route, this is intentionally just an ordering of concerns.
 * The one thing worth noting is that the bug array is re-validated even though
 * it originally came from our own /api/hunt response: the browser is the
 * untrusted link between the two calls.
 */

const { CODER_MODEL } = require('../config');
const { callGroq } = require('../groq');
const { validateInput, validateBugs } = require('../validate');
const { stripFence } = require('../parse');
const { buildCoderMessages } = require('../prompts');
const { HttpError } = require('../errors');

/**
 * @type {import('express').RequestHandler}
 */
async function fix(req, res, next) {
  try {
    const { code, language } = validateInput(req.body);
    const bugs = validateBugs(req.body.bugs);

    const content = await callGroq(
      buildCoderMessages(code, language, bugs),
      CODER_MODEL
    );

    // An empty reply is a failure, not a result. Guarded here so it becomes a
    // 502 with a clear message rather than an empty panel the user reads as
    // "no changes were needed".
    if (typeof content !== 'string' || content.trim() === '') {
      throw new HttpError(502, 'Model returned no fixed code.');
    }

    res.json({ code: stripFence(content) });
  } catch (err) {
    next(err);
  }
}

module.exports = fix;
