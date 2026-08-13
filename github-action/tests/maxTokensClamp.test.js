import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Unit tests for the max-tokens normalization in github-action/index.js
 * (issue #3673). The input must be clamped to the model's supported output
 * maximum (128k for llama-3.3-70b-versatile) so out-of-range values cannot
 * cause silent cost blow-ups or hard Groq API failures, and invalid values
 * fall back to the 4096 default.
 *
 * The logic mirrors the runtime in github-action/index.js.
 */
const MAX_OUTPUT_TOKENS = 128 * 1024;

function normalizeMaxTokens(raw, fallback = 4096) {
  const parsed = parseInt(raw, 10);
  let tokens = Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  if (tokens > MAX_OUTPUT_TOKENS) {
    tokens = MAX_OUTPUT_TOKENS;
  }
  return tokens;
}

test('in-range max-tokens values are passed through unchanged', () => {
  assert.equal(normalizeMaxTokens('4096'), 4096);
  assert.equal(normalizeMaxTokens('1000'), 1000);
  assert.equal(normalizeMaxTokens('131072'), MAX_OUTPUT_TOKENS);
});

test('max-tokens above the model maximum is clamped to 128k', () => {
  assert.equal(normalizeMaxTokens('1000000'), MAX_OUTPUT_TOKENS);
  assert.equal(normalizeMaxTokens('131073'), MAX_OUTPUT_TOKENS);
  assert.equal(normalizeMaxTokens('999999999'), MAX_OUTPUT_TOKENS);
});

test('invalid max-tokens values fall back to the default', () => {
  assert.equal(normalizeMaxTokens('abc'), 4096);
  assert.equal(normalizeMaxTokens(''), 4096);
  assert.equal(normalizeMaxTokens('NaN'), 4096);
});

test('non-positive max-tokens values fall back to the default', () => {
  assert.equal(normalizeMaxTokens('0'), 4096);
  assert.equal(normalizeMaxTokens('-1'), 4096);
  assert.equal(normalizeMaxTokens('-1000000'), 4096);
});
