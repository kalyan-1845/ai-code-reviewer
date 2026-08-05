import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { concurrencyThrottleMiddleware } from '../middleware/rateLimiter.js';

// Issue #3583: API-key clients (no session cookie) used to receive a fresh
// crypto.randomUUID() clientId on every request. Because the concurrency
// throttle keys its in-flight counter on req.clientId, the counter never
// accumulated for a single key holder and MAX_CONCURRENT_REQUESTS_PER_USER
// was a no-op — a client could fire unlimited parallel /api/analyze requests.
//
// The fix derives a STABLE clientId from the validated API key + caller IP, so
// parallel requests from one key holder share a single concurrency budget.

const MAX_CONCURRENT_REQUESTS_PER_USER = 3;

function stableClientIdForApiKey(apiKey, ip) {
  return crypto.createHash('sha256').update(`${apiKey}:${ip}`).digest('hex');
}

function makeReqRes(clientId) {
  const req = { 
    clientId,
    on(event, cb) { return this; }
  };
  const res = {
    statusCode: 200,
    jsonBody: null,
    _finishCbs: [],
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.jsonBody = payload;
      return this;
    },
    on(event, cb) {
      if (event === 'finish') this._finishCbs.push(cb);
      return this;
    },
    emitFinish() {
      for (const cb of this._finishCbs.splice(0)) cb();
    },
  };
  const nextCalled = { value: false };
  const next = () => { nextCalled.value = true; };
  return { req, res, next, nextCalled };
}

test('one API key holder can keep at most MAX_CONCURRENT_REQUESTS_PER_USER requests in flight', () => {
  const clientId = stableClientIdForApiKey('shared-key', '203.0.113.10');
  const inFlight = [];

  for (let i = 0; i < MAX_CONCURRENT_REQUESTS_PER_USER; i++) {
    const ctx = makeReqRes(clientId);
    concurrencyThrottleMiddleware(ctx.req, ctx.res, ctx.next);
    assert.equal(ctx.nextCalled.value, true, `request ${i + 1} must be admitted`);
    assert.equal(ctx.res.statusCode, 200);
    inFlight.push(ctx);
  }

  // The 4th parallel request must be rejected with 429.
  const overLimit = makeReqRes(clientId);
  concurrencyThrottleMiddleware(overLimit.req, overLimit.res, overLimit.next);
  assert.equal(overLimit.nextCalled.value, false, 'over-limit request must not reach the handler');
  assert.equal(overLimit.res.statusCode, 429, 'over-limit request must receive 429');
  assert.match(overLimit.res.jsonBody.error, /maximum concurrent requests/);

  // Completing one request frees a slot for the next one.
  inFlight[0].res.emitFinish();
  const afterRelease = makeReqRes(clientId);
  concurrencyThrottleMiddleware(afterRelease.req, afterRelease.res, afterRelease.next);
  assert.equal(afterRelease.nextCalled.value, true, 'slot must be freed after a request completes');
  assert.equal(afterRelease.res.statusCode, 200);
});

test('fresh per-request UUIDs (pre-fix behaviour) never trip the throttle', () => {
  // If clientId were a fresh random UUID per request, each request would get
  // its own counter, so 100 parallel requests would all be admitted — exactly
  // the bypass the issue describes.
  for (let i = 0; i < 20; i++) {
    const ctx = makeReqRes(crypto.randomUUID());
    concurrencyThrottleMiddleware(ctx.req, ctx.res, ctx.next);
    assert.equal(ctx.nextCalled.value, true, 'random-UUID requests bypass the throttle (this proves the fix is required)');
    assert.equal(ctx.res.statusCode, 200);
  }
});

test('different API key holders do not share a concurrency budget', () => {
  const holderA = stableClientIdForApiKey('key-a', '203.0.113.20');
  const holderB = stableClientIdForApiKey('key-b', '203.0.113.30');

  const ctxA = makeReqRes(holderA);
  concurrencyThrottleMiddleware(ctxA.req, ctxA.res, ctxA.next);
  assert.equal(ctxA.nextCalled.value, true);

  // B must be unaffected by A's in-flight request.
  const ctxB = makeReqRes(holderB);
  concurrencyThrottleMiddleware(ctxB.req, ctxB.res, ctxB.next);
  assert.equal(ctxB.nextCalled.value, true);
  assert.equal(ctxB.res.statusCode, 200);

  // Clean up A so the shared module-level map does not leak into other tests.
  ctxA.res.emitFinish();
});
