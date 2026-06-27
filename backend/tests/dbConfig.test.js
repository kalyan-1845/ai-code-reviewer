import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Unit tests for backend/config/db.js
// Tests closeDatabase and isDatabaseConnected functions.
// Mongoose operations that need real DB are tested for correct early-return
// and error-handling behavior without requiring a live MongoDB instance.
// ---------------------------------------------------------------------------

// Suppress console.warn during tests to keep output clean
const originalWarn = console.warn;
console.warn = () => {};

test('isDatabaseConnected returns false before any connection', async () => {
  const { isDatabaseConnected } = await import('../config/db.js');
  assert.strictEqual(isDatabaseConnected(), false,
    'isDatabaseConnected should return false before any connectDatabase call');
});

test('isDatabaseConnected returns a boolean type', async () => {
  const { isDatabaseConnected } = await import('../config/db.js');
  const result = isDatabaseConnected();
  assert.strictEqual(typeof result, 'boolean',
    'isDatabaseConnected should return a boolean');
});

test('closeDatabase is callable and returns when disconnected', async () => {
  const { closeDatabase } = await import('../config/db.js');
  // Should not throw when called while disconnected
  await closeDatabase();
  await closeDatabase();
  // Idempotent: calling twice should be safe
  assert.ok(true, 'closeDatabase should not throw when disconnected');
});

test('closeDatabase is a function and returns a Promise', async () => {
  const { closeDatabase } = await import('../config/db.js');
  const result = closeDatabase();
  assert.ok(result instanceof Promise, 'closeDatabase should return a Promise');
  await result;
});

test('connectDatabase returns a Promise without a real DB', async () => {
  const { connectDatabase } = await import('../config/db.js');
  const result = connectDatabase();
  assert.ok(result instanceof Promise, 'connectDatabase should return a Promise');
  // The promise resolves even without a real DB (with a warning)
  await result;
});

console.warn = originalWarn;
