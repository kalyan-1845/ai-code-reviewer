import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

// Set up REPOSAGE_API_KEY before importing the middleware
process.env.REPOSAGE_API_KEY = 'test-secret-key';
process.env.SESSION_SECRET = 'test-session-secret';

import { createFrontendSessionCookie, requireApiKey } from '../utils/authMiddleware.js';

function makeMockReqRes({ providedKey = '', cookie = '' } = {}) {
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
    cookie(name, value, options) {
      return this;
    },
  };
  const req = {
    headers: {
      ...(providedKey ? { 'x-api-key': providedKey } : {}),
      ...(cookie ? { cookie } : {}),
    },
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

test('requireApiKey calls next() when a valid frontend session cookie is provided', () => {
  const { res: cookieRes } = makeMockReqRes();
  const cookie = createFrontendSessionCookie(cookieRes);
  const { req, res } = makeMockReqRes({ cookie });
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  requireApiKey(req, res, next);

  assert.equal(nextCalled, true, 'next() should be called for valid session cookie');
  assert.equal(res.statusCode, null, 'no response should be sent for valid session cookie');
});

test('requireApiKey returns 401 when frontend session cookie is tampered', () => {
  const { res: cookieRes } = makeMockReqRes();
  const [sessionPair, ...attributes] = createFrontendSessionCookie(cookieRes).split(';');
  const cookie = [sessionPair.replace(/.$/, 'x'), ...attributes].join(';');
  const { req, res } = makeMockReqRes({ cookie });
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

test('requireApiKey returns 401 and safely handles error when session cookie payload is corrupt JSON', () => {
  const secret = process.env.REPOSAGE_API_KEY || 'test-secret-key';
  
  // Create a payload that is NOT valid JSON but is correctly signed
  const corruptPayload = Buffer.from('this-is-not-valid-json').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(corruptPayload).digest('base64url');
  
  // Construct the spoofed cookie: rps_v1_session=payload.signature
  const sessionCookie = `rps_v1_session=${corruptPayload}.${signature}`;
  
  const { req, res } = makeMockReqRes({ cookie: sessionCookie });
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  // This will hit the catch block of JSON.parse in the middleware
  requireApiKey(req, res, next);

  assert.equal(nextCalled, false, 'next() should not be called');
  assert.equal(res.statusCode, 401, 'should return 401 Unauthorized');
  assert.ok(res.body.error.includes('Unauthorized'), 'should return unauthorized error');
});
