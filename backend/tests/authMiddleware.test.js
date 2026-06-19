import test from 'node:test';
import assert from 'node:assert/strict';

// Set up REPOSAGE_API_KEY before importing the middleware
process.env.REPOSAGE_API_KEY = 'test-secret-key';

import { requireApiKey } from '../utils/authMiddleware.js';

function makeMockReqRes({ providedKey = '' } = {}) {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
  const req = {
    headers: providedKey ? { 'x-api-key': providedKey } : {},
    originalUrl: '/api/test',
  };
  return { req, res };
}

test('requireApiKey calls next() when valid key is provided', () => {
  const { req, res } = makeMockReqRes({ providedKey: 'test-secret-key' });
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  requireApiKey(req, res, next);

  assert.equal(nextCalled, true, 'next() should be called for valid key');
  assert.equal(res.statusCode, null, 'no response should be sent for valid key');
});

test('requireApiKey returns 401 when API key is missing', () => {
  const { req, res } = makeMockReqRes({ providedKey: '' });
  const next = () => {};

  requireApiKey(req, res, next);

  assert.equal(res.statusCode, 401);
  assert.ok(res.body.error.includes('Unauthorized'), 'should return unauthorized error');
});

test('requireApiKey returns 401 when API key is invalid', () => {
  const { req, res } = makeMockReqRes({ providedKey: 'wrong-key' });
  const next = () => {};

  requireApiKey(req, res, next);

  assert.equal(res.statusCode, 401);
  assert.ok(res.body.error.includes('Unauthorized'), 'should return unauthorized error');
});

test('requireApiKey returns 500 when REPOSAGE_API_KEY is not configured', () => {
  const origKey = process.env.REPOSAGE_API_KEY;
  delete process.env.REPOSAGE_API_KEY;

  // Re-import to pick up the missing env var
  // We need a fresh module for this test since requireApiKey reads env at call time
  const { req, res } = makeMockReqRes({ providedKey: 'any-key' });
  const next = () => {};

  // Temporarily delete the env and call
  requireApiKey(req, res, next);

  assert.equal(res.statusCode, 500, 'should return 500 when REPOSAGE_API_KEY is unset');
  assert.ok(res.body.error.includes('misconfiguration'), 'should indicate server misconfiguration');

  // Restore
  process.env.REPOSAGE_API_KEY = origKey;
});
