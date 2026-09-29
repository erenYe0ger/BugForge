/**
 * Tests for src/parse.js.
 *
 * These are the recovery paths for model replies. Every case here is something
 * a real model has actually returned, which is why the parsing is layered and
 * tolerant rather than a single strict JSON.parse.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { extractJsonArray, stripFence } = require('../src/parse');

test('extractJsonArray parses a bare array', () => {
  assert.deepEqual(extractJsonArray('[{"title":"a"}]'), [{ title: 'a' }]);
});

test('extractJsonArray unwraps a json fence', () => {
  assert.deepEqual(extractJsonArray('```json\n[{"title":"a"}]\n```'), [
    { title: 'a' },
  ]);
  assert.deepEqual(extractJsonArray('```\n[{"title":"a"}]\n```'), [
    { title: 'a' },
  ]);
});

test('extractJsonArray discards surrounding prose', () => {
  // The most common real failure: the model narrates, then appends the array.
  assert.deepEqual(
    extractJsonArray('Sure! Here are the bugs I found:\n[{"title":"b"}]\nHope that helps.'),
    [{ title: 'b' }]
  );
});

test('extractJsonArray handles a fence that also has prose inside', () => {
  assert.deepEqual(
    extractJsonArray('```json\nHere you go: [{"title":"c"}]\n```'),
    [{ title: 'c' }]
  );
});

test('extractJsonArray keeps nested brackets intact', () => {
  // Slicing first "[" to last "]" is only correct because it keeps the whole
  // structure, including brackets inside strings of nested objects.
  const out = extractJsonArray('[{"description":"use [0] index","line":3}]');
  assert.equal(out[0].line, 3);
  assert.equal(out[0].description, 'use [0] index');
});

test('extractJsonArray returns an empty array unchanged', () => {
  assert.deepEqual(extractJsonArray('[]'), []);
  assert.deepEqual(extractJsonArray('No bugs found.\n[]'), []);
});

test('extractJsonArray reports no-array output as a 502', () => {
  assert.throws(() => extractJsonArray('I found nothing odd.'), /no JSON array/);
  assert.throws(() => extractJsonArray(''), /no JSON array/);
  assert.throws(() => extractJsonArray('] backwards ['), /no JSON array/);
});

test('extractJsonArray reports malformed JSON as a 502', () => {
  assert.throws(() => extractJsonArray('[{"a":1,}]'), /malformed JSON/);
  assert.throws(() => extractJsonArray('[{unquoted}]'), /malformed JSON/);
});

test('extractJsonArray rejects a non-text response', () => {
  // Reasoning models can return null content, or content as a block array
  // rather than a string. Neither should crash the request.
  assert.throws(() => extractJsonArray(null), /non-text/);
  assert.throws(() => extractJsonArray(undefined), /non-text/);
  assert.throws(() => extractJsonArray([{ part: 'x' }]), /non-text/);
});

test('stripFence unwraps a fence covering the whole reply', () => {
  assert.equal(stripFence('```python\nprint(1)\n```'), 'print(1)');
  assert.equal(stripFence('```\nconst a = 1;\n```'), 'const a = 1;');
});

test('stripFence trims an unfenced reply', () => {
  assert.equal(stripFence('  const a = 1;  '), 'const a = 1;');
  assert.equal(stripFence('const a = 1;'), 'const a = 1;');
});

test('stripFence leaves a partial fence alone', () => {
  // The anchors matter: unwrapping a mid-response fence would truncate content.
  assert.equal(
    stripFence('Use ```js\nx\n``` like this'),
    'Use ```js\nx\n``` like this'
  );
});

test('stripFence handles a fence with no trailing newline before the close', () => {
  assert.equal(stripFence('```py\nx = 1```'), 'x = 1');
});
