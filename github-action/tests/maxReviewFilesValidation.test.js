import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Unit tests for the max-review-files normalization in github-action/index.js
 * (issue #3674). A non-numeric or non-positive value previously produced NaN,
 * which silently disabled the file cap because `totalReviewableFiles > NaN` is
 * always false. The value must fall back to 50 in those cases.
 *
 * The logic mirrors the runtime in github-action/index.js.
 */
function normalizeMaxReviewFiles(raw) {
  const parsed = parseInt(raw || '50', 10);
  const value = Number.isFinite(parsed) && parsed > 0 ? parsed : 50;
  return value;
}

test('valid max-review-files values are passed through', () => {
  assert.equal(normalizeMaxReviewFiles('50'), 50);
  assert.equal(normalizeMaxReviewFiles('100'), 100);
  assert.equal(normalizeMaxReviewFiles('1'), 1);
});

test('non-numeric max-review-files falls back to 50', () => {
  assert.equal(normalizeMaxReviewFiles('abc'), 50);
  assert.equal(normalizeMaxReviewFiles('NaN'), 50);
  assert.equal(normalizeMaxReviewFiles(''), 50);
});

test('non-positive max-review-files falls back to 50', () => {
  assert.equal(normalizeMaxReviewFiles('0'), 50);
  assert.equal(normalizeMaxReviewFiles('-5'), 50);
  assert.equal(normalizeMaxReviewFiles('-999'), 50);
});

test('the fallback cap still truncates partial reviews (not NaN)', () => {
  const cap = normalizeMaxReviewFiles('not-a-number');
  assert.ok(Number.isFinite(cap), 'the cap must be a finite number');
  assert.equal(5 > cap, false, 'a small review must not be truncated');
  assert.equal(60 > cap, true, 'a review above the cap must still be flagged as partial');
});
