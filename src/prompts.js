/**
 * The two agent prompts.
 *
 * Kept apart from the route handlers because they are content, not logic. They
 * are the most likely thing to be tuned, and having them in one file makes that
 * a one-file change with no risk of disturbing control flow.
 *
 * Both prompt builders are pure: they take the request payload and return a
 * messages array. Nothing here can fail on its own, which is why they return
 * data rather than throwing.
 *
 * Both are written to be maximally explicit about output format, because the
 * response contract is what the rest of the pipeline depends on. The Hunter's
 * reply goes through extractJsonArray, the Coder's through stripFence, and both
 * are considerably less reliable if the model drifts from the requested shape.
 */

/**
 * Build the message list for The Hunter.
 *
 * The Hunter is instructed to report only concrete defects and explicitly not to
 * pad the list with style nitpicks, because an audit that reports everything
 * finds nothing. The JSON schema is spelled out field by field since that is
 * what keeps the reply parseable.
 *
 * @param {string} code the user's source
 * @param {string} language an id from the LANGUAGES allowlist
 * @returns {Array<{role: string, content: string}>}
 */
function buildHunterMessages(code, language) {
  return [
    {
      role: 'system',
      content: [
        'You are The Hunter, a meticulous security and correctness auditor.',
        'Find real, concrete bugs in the supplied code: logic errors, security',
        'flaws, crashes, race conditions, resource leaks, and unhandled edge',
        'cases. Do not invent style issues or report speculative problems.',
        'Respond with a JSON array and nothing else. No prose, no code fences.',
        'Each element must be an object with:',
        'severity (one of "critical","high","medium","low"),',
        'title (short string), line (integer or null if not applicable),',
        'description (what is wrong and why it matters).',
      ].join(' '),
    },
    {
      role: 'user',
      content: `Language: ${language}\n\nCode:\n${code}`,
    },
  ];
}

/**
 * Build the message list for The Coder.
 *
 * The Coder returns the complete corrected file, not a diff or a patch. That is
 * what makes the right-hand panel copy-pasteable with no merge step, which is
 * the whole point of the output.
 *
 * The bug list is serialized into the user message rather than passed as
 * structured content, because the API being used has no structured-content
 * convention and this keeps the request shape uniform.
 *
 * @param {string} code the user's original source
 * @param {string} language an id from the LANGUAGES allowlist
 * @param {Array<{severity: string, title: string, line: number|null, description: string}>} bugs
 * @returns {Array<{role: string, content: string}>}
 */
function buildCoderMessages(code, language, bugs) {
  return [
    {
      role: 'system',
      content: [
        'You are The Coder, an expert engineer who fixes reported defects.',
        'Rewrite the entire supplied code with every reported bug fixed.',
        'Keep the original structure, naming, and behaviour except where a fix',
        'requires a change. Apply the fixes; do not just describe them.',
        'Respond with the complete corrected code only. No prose, no code fences.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Language: ${language}`,
        '',
        'Bugs to fix:',
        JSON.stringify(bugs, null, 2),
        '',
        'Original code:',
        code,
      ].join('\n'),
    },
  ];
}

module.exports = { buildHunterMessages, buildCoderMessages };
