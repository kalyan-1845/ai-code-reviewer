import test from 'node:test';
import assert from 'node:assert/strict';
import { CircuitBreaker } from '../utils/circuitBreaker.js';

test('CircuitBreaker: requires multiple successes in HALF_OPEN state to close', async () => {
  const cb = new CircuitBreaker({
    failureThreshold: 2,
    cooldownMs: 50,
    halfOpenMaxRequests: 3,
  });

  // Trip to OPEN
  try {
    await cb.call(async () => { throw new Error('err'); });
  } catch {}
  try {
    await cb.call(async () => { throw new Error('err'); });
  } catch {}
  assert.equal(cb.getState(), 'OPEN');

  // Wait for cooldown
  await new Promise(r => setTimeout(r, 60));

  // Trigger first request in HALF_OPEN (transits automatically on call)
  const res1 = await cb.call(async () => 'ok1');
  assert.equal(res1, 'ok1');
  assert.equal(cb.getState(), 'HALF_OPEN', 'Should remain HALF_OPEN after 1 success');

  // Trigger second request
  const res2 = await cb.call(async () => 'ok2');
  assert.equal(res2, 'ok2');
  assert.equal(cb.getState(), 'HALF_OPEN', 'Should remain HALF_OPEN after 2 successes');

  // Trigger third request (consecutive successes threshold reached)
  const res3 = await cb.call(async () => 'ok3');
  assert.equal(res3, 'ok3');
  assert.equal(cb.getState(), 'CLOSED', 'Should transition to CLOSED after 3 consecutive successes');
});
