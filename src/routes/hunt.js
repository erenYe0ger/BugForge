/**
 * POST /api/hunt — the Hunter agent.
 *
 * Request  { code, language }
 * Response { bugs: [{ severity, title, line, description }] }
 *
 * A deliberately thin route. Validation, prompting, the upstream call, and
 * parsing all live in their own modules, so the only thing left here is the
 * order in which they run, which is the part worth reading.
 */

const { HUNTER_MODEL } = require('../config');
const { callGroq } = require('../groq');
const { validateInput, validateBugs } = require('../validate');
const { extractJsonArray } = require('../parse');
const { buildHunterMessages } = require('../prompts');

/**
 * @type {import('express').RequestHandler}
 */
async function hunt(req, res, next) {
  try {
    const { code, language } = validateInput(req.body);

    const content = await callGroq(
      buildHunterMessages(code, language),
      HUNTER_MODEL
    );

    // Parse and normalize on the server, never in the browser. It means the
    // client receives a shape it can trust, and a malformed model reply becomes
    // one clean 502 rather than a crash in page code.
    res.json({ bugs: validateBugs(extractJsonArray(content)) });
  } catch (err) {
    // Express 5 forwards rejected promises from async handlers on its own, but
    // the explicit next(err) is kept so the intent is obvious to a reader who
    // does not know that.
    next(err);
  }
}

module.exports = hunt;
