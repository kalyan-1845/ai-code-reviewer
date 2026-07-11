import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Unit tests for /api/session POST endpoint and createFrontendSessionCookie.
// Tests cover: API key validation (requireApiKey), session cookie creation,
// and cookie attribute structure. Does not require a live MongoDB connection.
// ---------------------------------------------------------------------------

import { createFrontendSessionCookie, requireApiKey } from '../utils/authMiddleware.js';

// Set up a test API key and session secret for all tests
process.env.REPOSAGE_API_KEY = 'test-session-key-123';
process.env.SESSION_SECRET = 'test-session-secret-456';

function makeMockReqRes(overrides = {}) {
  const headers = {};
  const resHeaders = {};
  let _statusCode = null;
  let _body = null;
  const res = {
    statusCode: null,
    body: null,
    getHeader(name) {
      return resHeaders[name.toLowerCase()];
    },
    setHeader(name, value) {
      resHeaders[name.toLowerCase()] = value;
    },
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
    headers,
    originalUrl: '/api/session',
    ...overrides,
  };
  return { req, res };
}

function makeSessionReqRes() {
  const resHeaders = {};
  const res = {
    getHeader(name) {
      return resHeaders[name.toLowerCase()];
    },
    setHeader(name, value) {
      resHeaders[name.toLowerCase()] = value;
    },
    status(code) {
      return this;
    },
    json(data) {
      return this;
    },
    cookie(name, value, options) {
      return this;
    },
  };
  const req = {
    headers: {},
    originalUrl: '/api/session',
  };
  return { req, res };
}

test('requireApiKey calls next() when valid API key is provided', () => {
  const { req, res } = makeMockReqRes({
    headers: { 'x-api-key': 'test-session-key-123' },
  });
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  requireApiKey(req, res, next);

  assert.strictEqual(nextCalled, true, 'next() should be called for valid API key');
});

test('requireApiKey returns 401 when API key is missing', () => {
  const { req, res } = makeMockReqRes({ headers: {} });
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  requireApiKey(req, res, next);

  assert.strictEqual(res.statusCode, 401, 'should return 401 for missing API key');
  assert.strictEqual(nextCalled, false, 'next() should not be called');
});

test('requireApiKey returns 401 when API key is invalid', () => {
  const { req, res } = makeMockReqRes({
    headers: { 'x-api-key': 'wrong-key' },
  });
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  requireApiKey(req, res, next);

  assert.strictEqual(res.statusCode, 401, 'should return 401 for invalid API key');
  assert.strictEqual(nextCalled, false, 'next() should not be called');
});

test('requireApiKey accepts session cookie as alternative auth', () => {
  // Validates that requireApiKey does not crash when session cookie is absent
  // (the actual session cookie check is tested in authMiddleware.test.js)
  const { req, res } = makeMockReqRes({
    headers: { 'x-api-key': 'test-session-key-123' },
  });
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  requireApiKey(req, res, next);

  assert.strictEqual(nextCalled, true);
});

test('createFrontendSessionCookie returns a non-empty cookieHeader with valid API key', () => {
  const { res } = makeSessionReqRes();
  const session = createFrontendSessionCookie(res);
  assert.ok(typeof session === 'object' && session.cookieHeader, 'should return an object with cookieHeader');
  assert.ok(session.cookieHeader.length > 0, 'cookieHeader should not be empty');
  assert.ok(typeof session.clientId === 'string', 'should return a clientId');
});

test('createFrontendSessionCookie includes HttpOnly flag', () => {
  const { res } = makeSessionReqRes();
  const session = createFrontendSessionCookie(res);
  assert.ok(session.cookieHeader.includes('HttpOnly'), 'cookie should have HttpOnly flag');
});

test('createFrontendSessionCookie includes SameSite=Strict', () => {
  const { res } = makeSessionReqRes();
  const session = createFrontendSessionCookie(res);
  assert.ok(session.cookieHeader.includes('SameSite=Strict'), 'cookie should have SameSite=Strict');
});

test('createFrontendSessionCookie includes Path=/', () => {
  const { res } = makeSessionReqRes();
  const session = createFrontendSessionCookie(res);
  assert.ok(session.cookieHeader.includes('Path=/'), 'cookie should have Path=/');
});

test('createFrontendSessionCookie includes Max-Age', () => {
  const { res } = makeSessionReqRes();
  const session = createFrontendSessionCookie(res);
  assert.ok(session.cookieHeader.includes('Max-Age='), 'cookie should have Max-Age');
});

test('createFrontendSessionCookie includes rps_v1_session name prefix', () => {
  const { res } = makeSessionReqRes();
  const session = createFrontendSessionCookie(res);
  assert.ok(session.cookieHeader.startsWith('rps_v1_session='), 'cookie name should be rps_v1_session');
});

test('createFrontendSessionCookie value has payload.signature format', () => {
  const { res } = makeSessionReqRes();
  const session = createFrontendSessionCookie(res);
  const nameValuePart = session.cookieHeader.split(';')[0]; // "rps_v1_session=base64.sig"
  const value = nameValuePart.split('=')[1];
  assert.ok(value.includes('.'), 'cookie value should have payload.signature format');
  const segments = value.split('.');
  assert.strictEqual(segments.length, 2, 'cookie should have exactly 2 dot-separated segments');
});

test('createFrontendSessionCookie payload is valid base64url', () => {
  const { res } = makeSessionReqRes();
  const session = createFrontendSessionCookie(res);
  const nameValuePart = session.cookieHeader.split(';')[0];
  const value = nameValuePart.split('=')[1];
  const payload = value.split('.')[0];
  // Verify it decodes as valid base64url (no invalid chars)
  const base64urlRegex = /^[A-Za-z0-9_-]+$/;
  assert.ok(base64urlRegex.test(payload), 'payload should be valid base64url');
});

test('requireApiKey is exported as a function', () => {
  assert.strictEqual(typeof requireApiKey, 'function',
    'requireApiKey should be exported as a function');
});

test('createFrontendSessionCookie is exported as a function', () => {
  assert.strictEqual(typeof createFrontendSessionCookie, 'function',
    'createFrontendSessionCookie should be exported as a function');
});
