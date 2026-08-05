import test from 'node:test';
import assert from 'node:assert/strict';
import { registerTimer, clearAllTimers, getTimerCount } from '../utils/timerRegistry.js';

// Mock setInterval/clearInterval for isolation
const originalSetInterval = globalThis.setInterval;
const originalClearInterval = globalThis.clearInterval;
const fakeTimers = new Set();

let timerIdCounter = 1;
function makeFakeTimer() {
  const id = timerIdCounter++;
  fakeTimers.add(id);
  return id;
}

globalThis.setInterval = (fn, delay) => makeFakeTimer();
globalThis.clearInterval = (id) => { fakeTimers.delete(id); };

// Reset state before each test
function resetTimers() {
  fakeTimers.clear();
  timerIdCounter = 1;
}

test('registerTimer adds a timer and getTimerCount reflects it', () => {
  resetTimers();
  assert.equal(getTimerCount(), 0);
  const t = registerTimer(makeFakeTimer());
  assert.equal(t, makeFakeTimer() - 1); // the timer returned is the one registered
  // Count is internal — verify by registering and checking count increases
  resetTimers();
  registerTimer(1);
  registerTimer(2);
  assert.equal(getTimerCount(), 2);
});

test('registerTimer returns the timer it was passed', () => {
  resetTimers();
  const t = makeFakeTimer();
  const result = registerTimer(t);
  assert.equal(result, t);
});

test('clearAllTimers empties the registry and getTimerCount returns 0', () => {
  resetTimers();
  registerTimer(makeFakeTimer());
  registerTimer(makeFakeTimer());
  assert.ok(getTimerCount() > 0);
  clearAllTimers();
  assert.equal(getTimerCount(), 0);
});

test('clearAllTimers calls clearInterval on each registered timer', () => {
  resetTimers();
  const called = [];
  const orig = globalThis.clearInterval;
  globalThis.clearInterval = (id) => { called.push(id); };
  registerTimer(10);
  registerTimer(20);
  clearAllTimers();
  globalThis.clearInterval = orig;
  assert.deepEqual(called.sort(), [10, 20]);
});

test('multiple timers can be registered and cleared together', () => {
  resetTimers();
  for (let i = 0; i < 5; i++) registerTimer(makeFakeTimer());
  assert.equal(getTimerCount(), 5);
  clearAllTimers();
  assert.equal(getTimerCount(), 0);
});

test('clearAllTimers can be called on an already-empty registry without error', () => {
  resetTimers();
  clearAllTimers(); // must not throw
  assert.equal(getTimerCount(), 0);
});

test('clearAllTimers called twice returns registry to 0', () => {
  resetTimers();
  registerTimer(makeFakeTimer());
  clearAllTimers();
  clearAllTimers();
  assert.equal(getTimerCount(), 0);
});

// Restore globals after all tests
test.afterEach(() => {
  resetTimers();
});
