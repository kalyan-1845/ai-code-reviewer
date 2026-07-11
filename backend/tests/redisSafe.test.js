import test from 'node:test';
import assert from 'node:assert/strict';

const originalWarn = console.warn;
console.warn = () => {};

test('sanitizeRedisKey returns _empty_ for null input', async () => {
  const { sanitizeRedisKey } = await import('../utils/redisSafe.js');
  assert.strictEqual(sanitizeRedisKey(null), '_empty_');
});

test('sanitizeRedisKey returns _empty_ for undefined input', async () => {
  const { sanitizeRedisKey } = await import('../utils/redisSafe.js');
  assert.strictEqual(sanitizeRedisKey(undefined), '_empty_');
});

test('sanitizeRedisKey returns _empty_ for empty string', async () => {
  const { sanitizeRedisKey } = await import('../utils/redisSafe.js');
  assert.strictEqual(sanitizeRedisKey(''), '_empty_');
});

test('sanitizeRedisKey removes carriage return and newline', async () => {
  const { sanitizeRedisKey } = await import('../utils/redisSafe.js');
  assert.strictEqual(sanitizeRedisKey('key\rwith\nnewlines'), 'keywithnewlines');
});

test('sanitizeRedisKey removes null bytes', async () => {
  const { sanitizeRedisKey } = await import('../utils/redisSafe.js');
  assert.strictEqual(sanitizeRedisKey('key\x00with\x00null'), 'keywithnull');
});

test('sanitizeRedisKey removes control characters', async () => {
  const { sanitizeRedisKey } = await import('../utils/redisSafe.js');
  assert.strictEqual(sanitizeRedisKey('key\x1fwith\x7fctrl'), 'keywithctrl');
});

test('sanitizeRedisKey replaces spaces with underscores', async () => {
  const { sanitizeRedisKey } = await import('../utils/redisSafe.js');
  assert.strictEqual(sanitizeRedisKey('key with spaces'), 'key_with_spaces');
  // tabs are stripped as control characters, not replaced
  assert.strictEqual(sanitizeRedisKey('key\twith\ttabs'), 'keywithtabs');
  // multiple consecutive spaces collapse to one underscore
  assert.strictEqual(sanitizeRedisKey('key  with  multiple  spaces'), 'key_with_multiple_spaces');
});

test('sanitizeRedisKey replaces non-word characters except colon dash dot', async () => {
  const { sanitizeRedisKey } = await import('../utils/redisSafe.js');
  assert.strictEqual(sanitizeRedisKey('key@with#special$chars'), 'key_with_special_chars');
  assert.strictEqual(sanitizeRedisKey('key!with%chars^'), 'key_with_chars_');
});

test('sanitizeRedisKey preserves colons dashes and dots', async () => {
  const { sanitizeRedisKey } = await import('../utils/redisSafe.js');
  assert.strictEqual(sanitizeRedisKey('key:with:colons'), 'key:with:colons');
  assert.strictEqual(sanitizeRedisKey('key-with-dashes'), 'key-with-dashes');
  assert.strictEqual(sanitizeRedisKey('key.with.dots'), 'key.with.dots');
});

test('sanitizeRedisKey prefixes keys starting with colon', async () => {
  const { sanitizeRedisKey } = await import('../utils/redisSafe.js');
  assert.strictEqual(sanitizeRedisKey(':key:starts:colon'), '_:key:starts:colon');
});

test('sanitizeRedisKey prefixes keys starting with dash', async () => {
  const { sanitizeRedisKey } = await import('../utils/redisSafe.js');
  assert.strictEqual(sanitizeRedisKey('-key-starts-dash'), '_-key-starts-dash');
});

test('sanitizeRedisKey truncates to maxLength', async () => {
  const { sanitizeRedisKey } = await import('../utils/redisSafe.js');
  const longKey = 'a'.repeat(200);
  const result = sanitizeRedisKey(longKey, 128);
  assert.strictEqual(result.length, 128);
});

test('sanitizeRedisKey truncates at default 128 when maxLength not provided', async () => {
  const { sanitizeRedisKey } = await import('../utils/redisSafe.js');
  const longKey = 'a'.repeat(200);
  const result = sanitizeRedisKey(longKey);
  assert.strictEqual(result.length, 128);
});

test('sanitizeRedisKey colons are replaced with underscores then prefixed', async () => {
  const { sanitizeRedisKey } = await import('../utils/redisSafe.js');
  // ':' is replaced by '_' (non-word char), then prefixed
  const result = sanitizeRedisKey(':');
  assert.strictEqual(result, '_:');
});



console.warn = originalWarn;
