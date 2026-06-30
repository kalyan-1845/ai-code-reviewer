import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Unit tests for the batchSize normalization logic in the /api/analyze route.
 *
 * The actual normalization logic in the source is:
 *   batchSize = Math.max(1, Math.min(20, parseInt(batchSize, 10) || 5))
 *
 * Key insight: `parseInt(...) || 5` falls back to 5 for ANY falsy result,
 * including 0 and negative integers (since `||` checks truthiness, not numeric range).
 * The clamping to [1, 20] happens AFTER the || fallback.
 */
function normalizeBatchSize(batchSize) {
  return Math.max(1, Math.min(20, parseInt(batchSize, 10) || 5));
}

test('batchSize at exact boundaries stays unchanged', () => {
  assert.equal(normalizeBatchSize(1), 1);
  assert.equal(normalizeBatchSize(20), 20);
});

test('batchSize within valid range stays unchanged', () => {
  assert.equal(normalizeBatchSize(5), 5);
  assert.equal(normalizeBatchSize(10), 10);
  assert.equal(normalizeBatchSize(15), 15);
});

test('batchSize above 20 clamps to 20', () => {
  assert.equal(normalizeBatchSize(21), 20);
  assert.equal(normalizeBatchSize(100), 20);
  assert.equal(normalizeBatchSize(999), 20);
  assert.equal(normalizeBatchSize(1000000), 20);
});

test('zero falls back to 5, negative numbers clamp to 1', () => {
  // parseInt('0') = 0 (falsy) → || 5 kicks in → Math.max(1, Math.min(20, 5)) = 5
  assert.equal(normalizeBatchSize(0), 5);
  // parseInt(-1) = -1 (truthy) → clamping applies: Math.max(1, Math.min(20, -1)) = 1
  assert.equal(normalizeBatchSize(-1), 1);
  assert.equal(normalizeBatchSize(-5), 1);
});

test('non-numeric string values fall back to 5', () => {
  assert.equal(normalizeBatchSize('abc'), 5);
  assert.equal(normalizeBatchSize('hello'), 5);
  assert.equal(normalizeBatchSize(''), 5);
  assert.equal(normalizeBatchSize('not-a-number'), 5);
});

test('parseInt parses leading digits from mixed strings', () => {
  // parseInt extracts the leading integer from mixed alphanumeric strings
  assert.equal(normalizeBatchSize('10abc'), 10);
  assert.equal(normalizeBatchSize('7xyz'), 7);
  assert.equal(normalizeBatchSize('50abc'), 20);  // 50 clamped to 20
  assert.equal(normalizeBatchSize('2.9'), 2);      // decimal truncated to 2
});

test('NaN and Infinity fall back to 5 via || 5', () => {
  // parseInt(NaN) = NaN (falsy) → || 5 → 5 → clamped to 5
  assert.equal(normalizeBatchSize(NaN), 5);
  // parseInt(Infinity) = NaN (falsy) → || 5 → 5
  assert.equal(normalizeBatchSize(Infinity), 5);
  assert.equal(normalizeBatchSize(-Infinity), 5);
});

test('null and undefined fall back to 5', () => {
  // parseInt(null) = NaN, parseInt(undefined) = NaN, both falsy → || 5
  assert.equal(normalizeBatchSize(null), 5);
  assert.equal(normalizeBatchSize(undefined), 5);
});

test('floating-point numbers are truncated by parseInt then clamped', () => {
  assert.equal(normalizeBatchSize(3.7), 3);    // parseInt truncates to 3
  assert.equal(normalizeBatchSize(3.1), 3);
  assert.equal(normalizeBatchSize(0.9), 5);    // parseInt(0.9) = 0, falsy → || 5
  assert.equal(normalizeBatchSize(19.9), 19);  // within range
  assert.equal(normalizeBatchSize(20.5), 20);  // within range
  assert.equal(normalizeBatchSize(21.1), 20);  // parsed as 21, clamped to 20
});

test('leading zeros are handled correctly', () => {
  assert.equal(normalizeBatchSize('05'), 5);
  assert.equal(normalizeBatchSize('007'), 7);
  assert.equal(normalizeBatchSize('020'), 20); // 20 within range
});
