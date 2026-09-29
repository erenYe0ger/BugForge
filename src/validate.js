/**
 * Input validation for anything arriving from the browser.
 *
 * Pure functions: no I/O, no environment access beyond the imported policy
 * constants, no side effects. That keeps them cheap to unit test, which is why
 * this file is split out from the routes rather than inlined into them.
 *
 * Both exported functions throw HttpError(400) on bad input and return a
 * sanitized value on success.
 */

const { LANGUAGES, MAX_CODE_CHARS, SEVERITIES } = require('./config');
const { HttpError } = require('./errors');

/**
 * Validate the `{ code, language }` payload that both routes require.
 *
 * @param {unknown} body the parsed JSON request body
 * @returns {{ code: string, language: string }} the sanitized pair
 */
function validateInput(body) {
  if (!body || typeof body !== 'object') {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }

  const { code, language } = body;

  if (typeof code !== 'string' || code.trim() === '') {
    throw new HttpError(400, 'Field "code" must be a non-empty string.');
  }

  if (code.length > MAX_CODE_CHARS) {
    throw new HttpError(
      400,
      `Field "code" exceeds the ${MAX_CODE_CHARS} character limit.`
    );
  }

  // Checked against the allowlist rather than merely for type, so the value
  // that ends up in the prompt is always one of a known set.
  if (!LANGUAGES.includes(language)) {
    throw new HttpError(
      400,
      `Field "language" must be one of: ${LANGUAGES.join(', ')}.`
    );
  }

  return { code, language };
}

/**
 * Normalize the bug array.
 *
 * Used twice, and the second use is the point: /api/fix receives bugs that
 * originally came from our own /api/hunt, but the browser sits between the two
 * calls and is not trusted. So the array is validated again on the way in.
 *
 * Every field is coerced to a known type, unknown severities are downgraded to
 * "medium", and long strings are truncated. Downgrading rather than rejecting is
 * deliberate: one odd field from a model should not fail an otherwise good
 * result, and the UI has a sensible default for each.
 *
 * @param {unknown} bugs the untrusted array
 * @returns {Array<{severity: string, title: string, line: number|null, description: string}>}
 */
function validateBugs(bugs) {
  if (!Array.isArray(bugs) || bugs.length === 0) {
    throw new HttpError(400, 'Field "bugs" must be a non-empty array.');
  }

  return bugs.map((bug) => {
    const rawSeverity = String(bug?.severity ?? '').toLowerCase();
    return {
      severity: SEVERITIES.includes(rawSeverity) ? rawSeverity : 'medium',
      title: String(bug?.title ?? 'Untitled finding').slice(0, 200),
      line: Number.isFinite(Number(bug?.line)) ? Number(bug.line) : null,
      description: String(bug?.description ?? '').slice(0, 4000),
    };
  });
}

module.exports = { validateInput, validateBugs };
