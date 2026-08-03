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
