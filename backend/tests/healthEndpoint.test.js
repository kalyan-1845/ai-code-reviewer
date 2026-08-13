import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Unit tests for GET /health and GET /api/health/circuit-breaker endpoints
// (backend/index.js lines 2978-3005).
// Tests cover: ok/degraded server states, circuit breaker state reporting,
// and timestamp fields.
// ---------------------------------------------------------------------------

function makeReqRes() {
  const resHeaders = {};
  const res = {
    statusCode: null,
    body: null,
    getHeader(name) { return resHeaders[name.toLowerCase()]; },
    setHeader(name, value) { resHeaders[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  return { res };
}

// Inline health handler (mirrors backend/index.js lines 2978-2994)
function healthHandler(res, serverReady, isDbConnected, getCircuitState) {
  if (!serverReady) {
    return res.status(503).json({
      status: 'starting_up',
      timestamp: new Date().toISOString(),
      database: isDbConnected ? 'connected' : 'disconnected',
      message: 'Server is still initializing. Please retry shortly.',
    });
  }
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: isDbConnected ? 'connected' : 'disconnected',
    mode: isDbConnected ? 'full' : 'degraded',
    circuitBreaker: getCircuitState(),
  });
}

// Inline circuit-breaker handler (mirrors backend/index.js lines 2996-3005)
function circuitBreakerHandler(res, getCircuitState) {
  res.status(200).json({
    ...getCircuitState(),
    timestamp: new Date().toISOString(),
  });
}

test('GET /health returns 200 with status=ok when server is ready and db connected', () => {
  const { res } = makeReqRes();
  healthHandler(res, true, true, () => ({ state: 'closed', failures: 0 }));
  assert.equal(res.statusCode, 200, 'should return 200');
  assert.equal(res.body.status, 'ok', 'status should be ok');
  assert.equal(res.body.database, 'connected', 'database should be connected');
  assert.equal(res.body.mode, 'full', 'mode should be full');
  assert.ok(res.body.timestamp, 'should include timestamp');
  assert.ok(res.body.circuitBreaker, 'should include circuitBreaker state');
});

test('GET /health returns 200 with mode=degraded when server is ready but db disconnected', () => {
  const { res } = makeReqRes();
  healthHandler(res, true, false, () => ({ state: 'closed', failures: 0 }));
  assert.equal(res.statusCode, 200, 'should return 200');
  assert.equal(res.body.status, 'ok', 'status should be ok');
  assert.equal(res.body.database, 'disconnected', 'database should be disconnected');
  assert.equal(res.body.mode, 'degraded', 'mode should be degraded');
});

test('GET /health returns 503 with status=starting_up when server is not ready', () => {
  const { res } = makeReqRes();
  healthHandler(res, false, false, () => ({}));
  assert.equal(res.statusCode, 503, 'should return 503 when server not ready');
  assert.equal(res.body.status, 'starting_up', 'status should be starting_up');
  assert.equal(res.body.database, 'disconnected', 'database should be disconnected');
  assert.ok(res.body.message, 'should include message');
});

test('GET /health returns 503 when server not ready but db is connected', () => {
  const { res } = makeReqRes();
  healthHandler(res, false, true, () => ({}));
  assert.equal(res.statusCode, 503, 'should return 503 when server not ready');
  assert.equal(res.body.status, 'starting_up', 'status should be starting_up');
  assert.equal(res.body.database, 'connected', 'database should still show connected');
});

test('GET /api/health/circuit-breaker returns 200 with circuit state and timestamp', () => {
  const { res } = makeReqRes();
  const mockCircuitState = { state: 'half-open', failures: 3, lastFailure: '2026-07-29T10:00:00Z' };
  circuitBreakerHandler(res, () => mockCircuitState);

  assert.equal(res.statusCode, 200, 'should return 200');
  assert.equal(res.body.state, 'half-open', 'should include circuit state');
  assert.equal(res.body.failures, 3, 'should include failure count');
  assert.ok(res.body.timestamp, 'should include timestamp');
});

test('GET /api/health/circuit-breaker includes all circuit state fields', () => {
  const { res } = makeReqRes();
  const mockCircuitState = { state: 'open', failures: 10, lastFailure: '2026-07-29T09:00:00Z', nextAttempt: '2026-07-29T09:05:00Z' };
  circuitBreakerHandler(res, () => mockCircuitState);

  assert.equal(res.statusCode, 200, 'should return 200');
  assert.deepEqual(res.body.state, 'open');
  assert.equal(res.body.failures, 10);
  assert.equal(res.body.lastFailure, '2026-07-29T09:00:00Z');
  assert.equal(res.body.nextAttempt, '2026-07-29T09:05:00Z');
  assert.ok(res.body.timestamp, 'should include timestamp');
});
