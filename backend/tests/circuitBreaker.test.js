import test from 'node:test';
import assert from 'node:assert/strict';
import { CircuitBreaker, CircuitBreakerOpenError } from '../utils/circuitBreaker.js';

test('CircuitBreaker: uses fallback defaults correctly', () => {
  const cb = new CircuitBreaker();
  assert.equal(cb._failureThreshold, 5);
  assert.equal(cb._cooldownMs, 30000);
  assert.equal(cb._halfOpenMaxRequests, 3);
  assert.equal(cb._timeoutMs, 10000);
});

test('CircuitBreaker: accepts zero values and custom options', () => {
  const cb = new CircuitBreaker({
    failureThreshold: 2,
    cooldownMs: 1000,
    halfOpenMaxRequests: 1,
    timeoutMs: 0,
  });
  assert.equal(cb._failureThreshold, 2);
  assert.equal(cb._cooldownMs, 1000);
  assert.equal(cb._halfOpenMaxRequests, 1);
  assert.equal(cb._timeoutMs, 0);
});

test('CircuitBreaker: does not increment halfOpenRequests in CLOSED state', async () => {
  const cb = new CircuitBreaker({ failureThreshold: 5 });
  assert.equal(cb._halfOpenRequests, 0);

  await cb.call(async () => 'ok');
  assert.equal(cb._halfOpenRequests, 0, 'should remain 0 in CLOSED state');

  try {
    await cb.call(async () => { throw new Error('fail'); });
  } catch (err) {
    assert.equal(err.message, 'fail');
  }
  assert.equal(cb._halfOpenRequests, 0, 'should remain 0 in CLOSED state even on failure');
});

test('CircuitBreaker: trips to OPEN after failureThreshold is reached', async () => {
  const cb = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 50 });
  
  // Failure 1
  try {
    await cb.call(async () => { throw new Error('err1'); });
  } catch (e) {
    assert.equal(e.message, 'err1');
  }
  assert.equal(cb.getState(), 'CLOSED');

  // Failure 2
  try {
    await cb.call(async () => { throw new Error('err2'); });
  } catch (e) {
    assert.equal(e.message, 'err2');
  }
  assert.equal(cb.getState(), 'OPEN');

  // Next call should throw CircuitBreakerOpenError immediately
  await assert.rejects(
    async () => { await cb.call(async () => 'ok'); },
    CircuitBreakerOpenError
  );
});
