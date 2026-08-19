import test from 'node:test';
import assert from 'node:assert/strict';
import { globToRegex, cleanAndParseJSON, isParseFailed, PARSE_FAILED, normalizeReviewLineNumber } from '../utils/actionUtils.js';

// ---------------------------------------------------------------------------
// globToRegex
// ---------------------------------------------------------------------------

test('globToRegex returns a RegExp instance', () => {
  const result = globToRegex('*.js');
  assert.ok(result instanceof RegExp, 'globToRegex should return a RegExp');
});

test('globToRegex: * matches files without slashes', () => {
  const regex = globToRegex('*.js');
  assert.ok(regex.test('app.js'), '*.js should match app.js');
  assert.ok(regex.test('index.js'), '*.js should match index.js');
  assert.ok(!regex.test('dir/app.js'), '*.js should not match dir/app.js');
  // *.js matches .js because [^/]* allows empty string before .js
  assert.ok(regex.test('.js'), '*.js should match .js (empty stem matches)');
});

test('globToRegex: ** matches across directory boundaries', () => {
  const regex = globToRegex('**/*.js');
  assert.ok(regex.test('app.js'), '**/*.js should match app.js');
  assert.ok(regex.test('dir/app.js'), '**/*.js should match dir/app.js');
  assert.ok(regex.test('a/b/c/app.js'), '**/*.js should match nested paths');
});

test('globToRegex: ? matches single non-slash character', () => {
  const regex = globToRegex('file?.js');
  assert.ok(regex.test('file1.js'), 'file?.js should match file1.js');
  assert.ok(regex.test('fileA.js'), 'file?.js should match fileA.js');
  assert.ok(!regex.test('file12.js'), 'file?.js should not match two chars');
  assert.ok(!regex.test('file.js'), 'file?.js should not match zero chars');
});

test('globToRegex: . escapes dot in patterns', () => {
  const regex = globToRegex('.gitignore');
  assert.ok(regex.test('.gitignore'), '.gitignore should match .gitignore');
  assert.ok(!regex.test('Xgitignore'), 'escaped . should not match any char');
});

test('globToRegex: / matches directory separator', () => {
  const regex = globToRegex('src/*.js');
  assert.ok(regex.test('src/app.js'), 'src/*.js should match src/app.js');
  assert.ok(!regex.test('lib/app.js'), 'src/*.js should not match other dirs');
});

test('globToRegex: multiple * in pattern', () => {
  const regex = globToRegex('**/*.test.js');
  assert.ok(regex.test('foo.test.js'), '**/*.test.js should match root test files');
  assert.ok(regex.test('dir/foo.test.js'), '**/*.test.js should match nested');
  assert.ok(!regex.test('foo.spec.js'), '**/*.test.js should not match .spec.js');
});

test('globToRegex: ** at end of pattern handles trailing slash', () => {
  const regex = globToRegex('node_modules/**');
  assert.ok(regex.test('node_modules/foo'), 'node_modules/** should match node_modules/foo');
  assert.ok(regex.test('node_modules/a/b'), 'node_modules/** should match deep paths');
});

// ---------------------------------------------------------------------------
// cleanAndParseJSON
// ---------------------------------------------------------------------------

test('cleanAndParseJSON parses valid JSON', () => {
  const result = cleanAndParseJSON('{"foo": "bar", "num": 42}');
  assert.deepStrictEqual(result, { foo: 'bar', num: 42 });
});

test('cleanAndParseJSON parses valid JSON with whitespace', () => {
  const result = cleanAndParseJSON('  \n{"ok": true}\n  ');
  assert.deepStrictEqual(result, { ok: true });
});

test('cleanAndParseJSON strips leading ```json and trailing ``` markdown fences', () => {
  const result = cleanAndParseJSON('```json\n{"result": "success"}\n```');
  assert.deepStrictEqual(result, { result: 'success' });
});

test('cleanAndParseJSON strips leading ``` without json language tag', () => {
  const result = cleanAndParseJSON('```\n{"k": "v"}\n```');
  assert.deepStrictEqual(result, { k: 'v' });
});

test('cleanAndParseJSON handles single backtick fences', () => {
  const result = cleanAndParseJSON('```json{"x":1}```');
  assert.deepStrictEqual(result, { x: 1 });
});

test('cleanAndParseJSON returns PARSE_FAILED for invalid JSON without throwing', () => {
  const result = cleanAndParseJSON('not valid json at all');
  assert.equal(result, PARSE_FAILED);
  assert.equal(result._parseFailed, true);
  assert.equal(isParseFailed(result), true);
});

test('cleanAndParseJSON returns PARSE_FAILED for truncated JSON', () => {
  const result = cleanAndParseJSON('{"reviews": [{"line": 3, "comment": "unterminated');
  assert.equal(isParseFailed(result), true);
});

test('cleanAndParseJSON returns PARSE_FAILED for empty string', () => {
  const result = cleanAndParseJSON('');
  assert.equal(isParseFailed(result), true);
});

test('cleanAndParseJSON handles whitespace-only input', () => {
  const result = cleanAndParseJSON('   \n\n  ');
  assert.equal(isParseFailed(result), true);
});

test('cleanAndParseJSON handles null-like plain text', () => {
  const result = cleanAndParseJSON('null');
  assert.equal(result, null);
});

test('isParseFailed is false for valid parsed reviews', () => {
  const result = cleanAndParseJSON('{"reviews": []}');
  assert.equal(isParseFailed(result), false);
});

test('malformed LLM output counts as a failed review, not a success', () => {
  // Mirror the review-path counting in index.js: success is only counted after
  // the parse check passes, and unparseable output increments failedReviewsCount
  // (and is excluded from the success summary).
  function reviewPath(content) {
    const parsed = cleanAndParseJSON(content);
    let successfulReviewsCount = 0;
    let failedReviewsCount = 0;
    if (isParseFailed(parsed)) {
      failedReviewsCount++;
      return { successfulReviewsCount, failedReviewsCount, parsed };
    }
    successfulReviewsCount++;
    return { successfulReviewsCount, failedReviewsCount, parsed };
  }

  const truncated = reviewPath('{"reviews": [{"line": 1, "comment": "trunc');
  assert.equal(truncated.failedReviewsCount, 1);
  assert.equal(truncated.successfulReviewsCount, 0);
  assert.equal(isParseFailed(truncated.parsed), true);

  const valid = reviewPath('{"reviews": [{"line": 1, "comment": "ok"}]}');
  assert.equal(valid.failedReviewsCount, 0);
  assert.equal(valid.successfulReviewsCount, 1);
  assert.equal(isParseFailed(valid.parsed), false);
});

test('cleanAndParseJSON handles JSON arrays', () => {
  const result = cleanAndParseJSON('[1, 2, 3]');
  assert.deepStrictEqual(result, [1, 2, 3]);
  assert.equal(isParseFailed(result), false);
});

test('normalizeReviewLineNumber accepts numbers and numeric strings', () => {
  assert.equal(normalizeReviewLineNumber(12), 12);
  assert.equal(normalizeReviewLineNumber('12'), 12);
});

test('normalizeReviewLineNumber rejects invalid line values', () => {
  assert.equal(normalizeReviewLineNumber('abc'), null);
  assert.equal(normalizeReviewLineNumber(0), null);
  assert.equal(normalizeReviewLineNumber(-1), null);
  assert.equal(normalizeReviewLineNumber(1.5), null);
});
