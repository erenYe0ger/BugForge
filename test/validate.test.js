/**
 * Tests for src/validate.js.
 *
 * These functions are the app's trust boundary: they are what stands between
 * whatever the browser sends and the model prompt, and what normalizes the bug
 * array before it is rendered or fed back into a second model call.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { validateInput, validateBugs } = require('../src/validate');
const { MAX_CODE_CHARS } = require('../src/config');

test('validateInput accepts a well-formed payload', () => {
  const out = validateInput({ code: 'let x = 1;', language: 'javascript' });
  assert.equal(out.code, 'let x = 1;');
  assert.equal(out.language, 'javascript');
});

test('validateInput rejects a missing or blank body', () => {
  assert.throws(() => validateInput(null), /JSON object/);
  assert.throws(() => validateInput('a string'), /JSON object/);
  assert.throws(() => validateInput(undefined), /JSON object/);
});

test('validateInput rejects code that is absent, blank, or not a string', () => {
  // A number must not be coerced, since it would become useless prompt text.
  assert.throws(() => validateInput({ language: 'go' }), /non-empty string/);
  assert.throws(
    () => validateInput({ code: '   ', language: 'go' }),
    /non-empty string/
  );
  assert.throws(
    () => validateInput({ code: 42, language: 'go' }),
    /non-empty string/
  );
});

test('validateInput enforces the size limit at the boundary', () => {
  // Exactly at the limit is allowed; one character over is not.
  const atLimit = 'a'.repeat(MAX_CODE_CHARS);
  assert.equal(validateInput({ code: atLimit, language: 'python' }).code.length, MAX_CODE_CHARS);

  const overLimit = 'a'.repeat(MAX_CODE_CHARS + 1);
  assert.throws(
    () => validateInput({ code: overLimit, language: 'python' }),
    /character limit/
  );
});

test('validateInput rejects a language outside the allowlist', () => {
  // This is the check that keeps an arbitrary client string out of the prompt.
  assert.throws(
    () => validateInput({ code: 'x', language: 'brainfuck' }),
    /must be one of/
  );
  assert.throws(() => validateInput({ code: 'x' }), /must be one of/);
  assert.throws(
    () => validateInput({ code: 'x', language: 'javascript ' }),
    /must be one of/
  );
});

test('validateBugs normalizes severity casing and numeric strings', () => {
  const out = validateBugs([
    { severity: 'CRITICAL', title: 'SQLi', line: '42', description: 'raw concat' },
  ]);
  assert.equal(out[0].severity, 'critical');
  assert.equal(out[0].line, 42);
});

test('validateBugs downgrades an unknown severity instead of failing', () => {
  // One odd field from a model must not discard an otherwise good audit.
  const out = validateBugs([{ severity: 'catastrophic', title: 'x' }, {}]);
  assert.equal(out[0].severity, 'medium');
  assert.equal(out[1].severity, 'medium');
});

test('validateBugs defaults a missing title and line', () => {
  const out = validateBugs([{}]);
  assert.equal(out[0].title, 'Untitled finding');
  assert.equal(out[0].line, null);
  assert.equal(out[0].description, '');
});

test('validateBugs truncates overlong strings', () => {
  const out = validateBugs([{ title: 't'.repeat(5000), description: 'd'.repeat(9000) }]);
  assert.equal(out[0].title.length, 200);
  assert.equal(out[0].description.length, 4000);
});

test('validateBugs coerces non-object entries rather than throwing', () => {
  // A null entry would throw on property access without the optional chaining.
  const out = validateBugs([null, 'nope', 7]);
  assert.equal(out.length, 3);
  assert.equal(out[0].severity, 'medium');
});

test('validateBugs rejects a non-array or empty array', () => {
  assert.throws(() => validateBugs([]), /non-empty array/);
  assert.throws(() => validateBugs({}), /non-empty array/);
  assert.throws(() => validateBugs(null), /non-empty array/);
});
