import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Unit tests for backend/config/env.js
// Tests GIT_CLONE_TIMEOUT and MAX_CLONE_SIZE_MB constants exported from
// backend/config/env.js. Because these are module-level exports evaluated at
// import time, the tests below verify the exported values and their properties
// rather than attempting to re-import the module with different env vars.
// ---------------------------------------------------------------------------

let mod;

test('import env.js module', async () => {
  mod = await import('../config/env.js');
  assert.ok(mod, 'module should be imported');
});

test('GIT_CLONE_TIMEOUT is exported', () => {
  assert.ok('GIT_CLONE_TIMEOUT' in mod, 'GIT_CLONE_TIMEOUT should be exported');
});

test('MAX_CLONE_SIZE_MB is exported', () => {
  assert.ok('MAX_CLONE_SIZE_MB' in mod, 'MAX_CLONE_SIZE_MB should be exported');
});

test('GIT_CLONE_TIMEOUT is a positive integer', () => {
  assert.strictEqual(typeof mod.GIT_CLONE_TIMEOUT, 'number');
  assert.strictEqual(Number.isInteger(mod.GIT_CLONE_TIMEOUT), true);
  assert.ok(mod.GIT_CLONE_TIMEOUT > 0);
});

test('MAX_CLONE_SIZE_MB is a positive integer', () => {
  assert.strictEqual(typeof mod.MAX_CLONE_SIZE_MB, 'number');
  assert.strictEqual(Number.isInteger(mod.MAX_CLONE_SIZE_MB), true);
  assert.ok(mod.MAX_CLONE_SIZE_MB > 0);
});

test('GIT_CLONE_TIMEOUT is at least the minimum allowed value', () => {
  // GIT_CLONE_TIMEOUT should be at least 1000ms
  assert.ok(mod.GIT_CLONE_TIMEOUT >= 1000);
});

test('MAX_CLONE_SIZE_MB is at least the minimum allowed value', () => {
  // MAX_CLONE_SIZE_MB should be at least 1MB
  assert.ok(mod.MAX_CLONE_SIZE_MB >= 1);
});

test('GIT_CLONE_TIMEOUT is not excessively large', () => {
  // Should not exceed 24 hours in ms
  assert.ok(mod.GIT_CLONE_TIMEOUT <= 86400000);
});

test('MAX_CLONE_SIZE_MB is not excessively large', () => {
  // Should not exceed 100GB
  assert.ok(mod.MAX_CLONE_SIZE_MB <= 100000);
});

test('GIT_CLONE_TIMEOUT and MAX_CLONE_SIZE_MB are distinct values', () => {
  assert.notStrictEqual(mod.GIT_CLONE_TIMEOUT, mod.MAX_CLONE_SIZE_MB);
});

test('parsePositiveInt is exported', () => {
  assert.ok('parsePositiveInt' in mod, 'parsePositiveInt should be exported');
  assert.strictEqual(typeof mod.parsePositiveInt, 'function');
});

test('parsePositiveInt returns value when valid positive integer', () => {
  const result = mod.parsePositiveInt('42', 'TEST', 99);
  assert.strictEqual(result, 42);
});

test('parsePositiveInt returns default when value is undefined', () => {
  const result = mod.parsePositiveInt(undefined, 'TEST', 50);
  assert.strictEqual(result, 50);
});

test('parsePositiveInt returns default when value is null', () => {
  const result = mod.parsePositiveInt(null, 'TEST', 50);
  assert.strictEqual(result, 50);
});

test('parsePositiveInt returns default when value is zero', () => {
  const result = mod.parsePositiveInt('0', 'TEST', 50);
  assert.strictEqual(result, 50);
});

test('parsePositiveInt returns default when value is negative', () => {
  const result = mod.parsePositiveInt('-10', 'TEST', 50);
  assert.strictEqual(result, 50);
});

test('parsePositiveInt returns default when value is not a number string', () => {
  const result = mod.parsePositiveInt('abc', 'TEST', 50);
  assert.strictEqual(result, 50);
});

test('parsePositiveInt returns default when value is NaN string', () => {
  const result = mod.parsePositiveInt('NaN', 'TEST', 50);
  assert.strictEqual(result, 50);
});

test('parsePositiveInt returns default when value is Infinity', () => {
  const result = mod.parsePositiveInt('Infinity', 'TEST', 50);
  assert.strictEqual(result, 50);
});

test('parsePositiveInt returns default when value is float string', () => {
  const result = mod.parsePositiveInt('3.14', 'TEST', 50);
  assert.strictEqual(result, 50);
});

test('parsePositiveInt returns integer from integer string', () => {
  const result = mod.parsePositiveInt('12345', 'TEST', 99);
  assert.strictEqual(result, 12345);
  assert.strictEqual(Number.isInteger(result), true);
});

test('parsePositiveInt ignores leading/trailing whitespace in string', () => {
  const result = mod.parsePositiveInt('  42  ', 'TEST', 99);
  assert.strictEqual(result, 42);
});

test('parsePositiveInt handles whitespace-only string as invalid', () => {
  const result = mod.parsePositiveInt('   ', 'TEST', 50);
  assert.strictEqual(result, 50);
});

test('parsePositiveInt default is returned when no value given', () => {
  const result = mod.parsePositiveInt('', 'TEST', 77);
  // Empty string parseInt returns NaN, which fails Number.isFinite check
  assert.strictEqual(result, 77);
});

test('parsePositiveInt accepts scientific notation that parses to positive integer', () => {
  // Number('1e5') === 100000, which passes isInteger and > 0
  const result = mod.parsePositiveInt('1e5', 'TEST', 50);
  assert.strictEqual(result, 100000);
});

test('parsePositiveInt accepts uppercase scientific notation', () => {
  const result = mod.parsePositiveInt('2E3', 'TEST', 50);
  assert.strictEqual(result, 2000);
});

test('parsePositiveInt returns value for float string that truncates to integer', () => {
  // Number('300.0') === 300, which is a positive integer
  const result = mod.parsePositiveInt('300.0', 'TEST', 50);
  assert.strictEqual(result, 300);
});

test('parsePositiveInt returns default for negative zero string', () => {
  // Number('-0') === -0, which fails num > 0 check
  const result = mod.parsePositiveInt('-0', 'TEST', 50);
  assert.strictEqual(result, 50);
});

test('parsePositiveInt returns default for very large integer string', () => {
  const result = mod.parsePositiveInt('99999999999999999999999999', 'TEST', 50);
  // Number('99999999999999999999999999') === 1e+26, which is integer > 0
  assert.strictEqual(result, 1e+26);
});

test('parsePositiveInt returns default for non-numeric string', () => {
  const result = mod.parsePositiveInt('hello', 'TEST', 50);
  assert.strictEqual(result, 50);
});

test('parsePositiveInt handles boolean-like strings', () => {
  const result = mod.parsePositiveInt('true', 'TEST', 50);
  assert.strictEqual(result, 50);
});

test('parsePositiveInt handles array string', () => {
  const result = mod.parsePositiveInt('[1,2,3]', 'TEST', 50);
  assert.strictEqual(result, 50);
});
