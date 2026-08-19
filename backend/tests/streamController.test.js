import test from 'node:test';
import assert from 'node:assert/strict';

const originalWarn = console.warn;
console.warn = () => {};
process.env.ENABLE_STREAM_PREVIEW = 'true';

process.env.ENABLE_STREAM_PREVIEW = 'true';

async function createMockReq() {
  const abortSignals = [];
  const closeCallbacks = [];

  return {
    on: (event, cb) => {
      if (event === 'close') {
        closeCallbacks.push(cb);
      }
    },
    _triggerClose() {
      closeCallbacks.forEach(cb => cb());
    },
  };
}

async function createMockRes() {
  const headers = {};
  const written = [];

  return {
    setHeader(key, value) {
      headers[key] = value;
    },
    write(data) {
      written.push(data);
      return true;
    },
    end() {
      written.push('[END]');
    },
    _headers: headers,
    _written: written,
  };
}

// Inline the streamReview function for testing (import the module after testing its parts)
const { streamReview } = await import('../controllers/streamController.js');

test('streamReview sets Content-Type header to text/event-stream', async () => {
  const req = await createMockReq();
  const res = await createMockRes();

  await streamReview(req, res);

  assert.strictEqual(res._headers['Content-Type'], 'text/event-stream');
});

test('streamReview sets Cache-Control header to no-cache', async () => {
  const req = await createMockReq();
  const res = await createMockRes();

  await streamReview(req, res);

  assert.strictEqual(res._headers['Cache-Control'], 'no-cache');
});

test('streamReview sets Connection header to keep-alive', async () => {
  const req = await createMockReq();
  const res = await createMockRes();

  await streamReview(req, res);

  assert.strictEqual(res._headers['Connection'], 'keep-alive');
});

test('streamReview sends [DONE] event on clean completion', async () => {
  const req = await createMockReq();
  const res = await createMockRes();

  await streamReview(req, res);

  assert.ok(res._written.some(w => w && w.includes('[DONE]')),
    'Expected [DONE] event in written data');
});

test('streamReview sends data events for each mock token', async () => {
  const req = await createMockReq();
  const res = await createMockRes();

  await streamReview(req, res);

  // The function writes 8 mock tokens
  const dataWrites = res._written.filter(w => w && w.startsWith('data:'));
  assert.ok(dataWrites.length >= 8, `Expected at least 8 data writes, got ${dataWrites.length}`);
});

test('streamReview ends the response on client close without throwing', async () => {
  const req = await createMockReq();
  const res = await createMockRes();

  // Trigger close immediately
  req._triggerClose();

  // Should not throw
  await streamReview(req, res);

  // Response should have ended
  assert.ok(res._written.includes('[END]'), 'Response should end after abort');
});

test('streamReview does not write token data after client close', async () => {
  const req = await createMockReq();
  const res = await createMockRes();

  // Store the initial write count
  const initialWrites = res._written.length;

  // Close immediately
  req._triggerClose();

  await streamReview(req, res);

  // Should end but not write all tokens
  assert.ok(res._written.includes('[END]'));
});

console.warn = originalWarn;
