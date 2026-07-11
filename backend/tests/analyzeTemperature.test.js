import test from 'node:test';
import assert from 'node:assert/strict';

function normalizeTemperature(temperature) {
  const parsedTemp = parseFloat(temperature);
  return isNaN(parsedTemp) ? 0.7 : Math.max(0, Math.min(2, parsedTemp));
}

test('temperature at exact boundaries stays unchanged', () => {
  assert.equal(normalizeTemperature(0), 0);
  assert.equal(normalizeTemperature(2), 2);
});

test('temperature within valid range stays unchanged', () => {
  assert.equal(normalizeTemperature(0.5), 0.5);
  assert.equal(normalizeTemperature(1.0), 1.0);
  assert.equal(normalizeTemperature(1.5), 1.5);
});

test('temperature above 2 clamps to 2', () => {
  assert.equal(normalizeTemperature(2.1), 2);
  assert.equal(normalizeTemperature(100), 2);
});

test('temperature below 0 clamps to 0', () => {
  assert.equal(normalizeTemperature(-0.5), 0);
  assert.equal(normalizeTemperature(-100), 0);
});

test('zero is preserved and does not fallback to 0.7', () => {
  assert.equal(normalizeTemperature(0), 0);
  assert.equal(normalizeTemperature('0'), 0);
  assert.equal(normalizeTemperature(0.0), 0);
});

test('non-numeric string values fall back to 0.7', () => {
  assert.equal(normalizeTemperature('abc'), 0.7);
  assert.equal(normalizeTemperature(''), 0.7);
  assert.equal(normalizeTemperature(undefined), 0.7);
  assert.equal(normalizeTemperature(null), 0.7);
  assert.equal(normalizeTemperature(NaN), 0.7);
});
