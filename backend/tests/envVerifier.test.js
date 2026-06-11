import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyPort, verifyHost } from '../utils/envVerifier.js';

test('verifyPort parses valid ports', () => {
  assert.equal(verifyPort('8080'), 8080);
  assert.equal(verifyPort(3000), 3000);
});

test('verifyPort returns fallback port for invalid inputs', () => {
  assert.equal(verifyPort(null), 5000);
  assert.equal(verifyPort(undefined), 5000);
  assert.equal(verifyPort('invalid'), 5000);
  assert.equal(verifyPort(0), 5000);
  assert.equal(verifyPort(-100), 5000);
  assert.equal(verifyPort(99999), 5000);
});

test('verifyHost returns valid hostnames', () => {
  assert.equal(verifyHost('  127.0.0.1  '), '127.0.0.1');
  assert.equal(verifyHost('localhost'), 'localhost');
});

test('verifyHost returns default hostname for invalid inputs', () => {
  assert.equal(verifyHost(''), 'localhost');
  assert.equal(verifyHost(null), 'localhost');
  assert.equal(verifyHost(undefined), 'localhost');
});
