/**
 * Parsing for model replies.
 *
 * Pure functions, no I/O, split out from the routes precisely because this is
 * the fiddliest logic in the app and deserves its own tests.
 *
 * Why this file exists at all: both system prompts demand "JSON only, no
 * fences", and models do not reliably comply. Rather than fail the request, we
 * recover the payload out of whatever wrapping the model chose. Recovering a
 * usable result beats a hard failure, and when recovery genuinely is not
 * possible these throw a 502 so the browser shows something specific.
 */

const { HttpError } = require('./errors');

/**
 * Extract a JSON array from a model reply.
 *
 * Recovery is layered:
 *   1. trim
 *   2. if the whole reply is wrapped in a ```json fence, take the inside
 *   3. otherwise slice from the first "[" to the last "]", discarding any
 *      surrounding prose such as "Sure! Here are the bugs I found:"
 *
 * Step 3 is what makes step 2 optional. It is a blunt instrument, but the
 * input is an array, so the first "[" and last "]" reliably bracket it even
 * with prose on both sides.
 *
 * @param {unknown} text the model's `content` field
 * @returns {unknown[]} the parsed array
 * @throws {HttpError} 502 when no array can be recovered
 */
function extractJsonArray(text) {
  if (typeof text !== 'string') {
    throw new HttpError(502, 'Model returned a non-text response.');
  }

  let candidate = text.trim();

  const fence = candidate.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidate = fence[1].trim();

  const start = candidate.indexOf('[');
  const end = candidate.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) {
    throw new HttpError(502, 'Model response contained no JSON array.');
  }

  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    if (!Array.isArray(parsed)) {
      throw new HttpError(502, 'Model JSON was not an array.');
    }
    return parsed;
  } catch (err) {
    // Re-throw our own 502 untouched. Only a genuine JSON.parse SyntaxError is
    // replaced, so the specific "no array" message is not lost.
    if (err instanceof HttpError) throw err;
    throw new HttpError(502, 'Model returned malformed JSON.');
  }
}

/**
 * Remove a markdown fence that wraps the ENTIRE reply.
 *
 * Used for the Coder's output, which should be a whole file and nothing else.
 * The `^` and `$` anchors are the important part: a fence appearing partway
 * through a response, for example the model quoting code inside a sentence, is
 * left alone. Unwrapping that would truncate real content.
 *
 * The Hunter does not use this. Its array is buried inside whatever the model
 * wrapped it in, so extractJsonArray handles that case instead.
 *
 * @param {string} text the model's `content` field
 * @returns {string} the unwrapped code
 */
function stripFence(text) {
  const fence = text.trim().match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```$/);
  return fence ? fence[1] : text.trim();
}

module.exports = { extractJsonArray, stripFence };
