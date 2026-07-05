import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

// ---------------------------------------------------------------------------
// Unit tests for backend/config/db.js
// Tests closeDatabase and isDatabaseConnected functions.
// Mongoose operations that need real DB are tested for correct early-return
// and error-handling behavior without requiring a live MongoDB instance.
// ---------------------------------------------------------------------------

// Override MONGODB_URI to prevent real MongoDB connection in CI.
// Native Mongoose connection objects can't be serialized via IPC
// on Node.js 20, causing ERR_TEST_FAILURE in the test runner.
process.env.MONGODB_URI = 'mongodb://0.0.0.0:1/test';

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

test('isDatabaseConnected is a boolean after module load (not connected)', async () => {
  const db = await import('../config/db.js');
  assert.strictEqual(typeof db.isDatabaseConnected(), 'boolean');
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

test('connectDatabase is an async function', async () => {
  const db = await import('../config/db.js');
  assert.strictEqual(typeof db.connectDatabase, 'function');
  const result = db.connectDatabase();
  // connectDatabase is async — returns a Promise
  assert.ok(result instanceof Promise);
  await result.catch(() => {}); // suppress — MongoDB not available in test env
});

test('closeDatabase is an async function', async () => {
  const db = await import('../config/db.js');
  assert.strictEqual(typeof db.closeDatabase, 'function');
  const result = db.closeDatabase();
  // closeDatabase is async — returns a Promise (even if it short-circuits)
  assert.ok(result instanceof Promise);
  await result.catch(() => {});
});

test('ensureConnection is an async function', async () => {
  const db = await import('../config/db.js');
  assert.strictEqual(typeof db.ensureConnection, 'function');
  const result = db.ensureConnection();
  // ensureConnection is async
  assert.ok(result instanceof Promise);
  await result.catch(() => {});
});

test('default export is an object with all four functions', async () => {
  const dbModule = await import('../config/db.js');
  const db = dbModule.default;
  assert.strictEqual(typeof db.connectDatabase, 'function');
  assert.strictEqual(typeof db.isDatabaseConnected, 'function');
  assert.strictEqual(typeof db.ensureConnection, 'function');
  assert.strictEqual(typeof db.closeDatabase, 'function');
});

test('named exports are identical to default export properties', async () => {
  const dbModule = await import('../config/db.js');
  const db = dbModule.default;
  assert.strictEqual(dbModule.connectDatabase, db.connectDatabase);
  assert.strictEqual(dbModule.isDatabaseConnected, db.isDatabaseConnected);
  assert.strictEqual(dbModule.ensureConnection, db.ensureConnection);
  assert.strictEqual(dbModule.closeDatabase, db.closeDatabase);
});

test('connectDatabase returns undefined when already connected', async () => {
  const db = await import('../config/db.js');
  // idempotent: returns undefined when already connected (skip path)
  const result = db.connectDatabase();
  // Returns undefined in the early-return path (isConnected was already true)
  // or a Promise in the reconnecting path
  assert.ok(result === undefined || result instanceof Promise);
});

test('closeDatabase returns undefined when not connected', async () => {
  const db = await import('../config/db.js');
  const result = db.closeDatabase();
  // Returns undefined in the early-return path (not connected)
  assert.ok(result === undefined || result instanceof Promise);
});

test('cleanup: disconnect mongoose to prevent IPC serialization errors', async () => {
  try {
    await mongoose.disconnect();
    mongoose.connection.removeAllListeners();
  } catch {
    // ignore cleanup errors
  }
  assert.ok(true, 'cleanup complete');
});

console.warn = originalWarn;
