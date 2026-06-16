import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyPort, verifyHost } from '../utils/envVerifier.js';

test('verifyPort parses valid ports', () => {
  assert.equal(verifyPort('8080'), 8080);
  assert.equal(verifyPort(3000), 3000);
  assert.equal(verifyPort('0'), 0);
  assert.equal(verifyPort(65535), 65535);
});

test('verifyPort returns fallback port for empty/undefined/null', () => {
  assert.equal(verifyPort(undefined), 5000);
  assert.equal(verifyPort(null), 5000);
  assert.equal(verifyPort(''), 5000);
});

test('verifyPort throws for non-numeric strings', () => {
  assert.throws(() => verifyPort('invalid'), /non-numeric/);
  assert.throws(() => verifyPort('5000abc'), /non-numeric/);
  assert.throws(() => verifyPort('3.14'), /non-numeric/);
});

test('verifyPort throws for edge cases like booleans and arrays', () => {
  assert.throws(() => verifyPort(false), /must be a string or number/);
  assert.throws(() => verifyPort(true), /must be a string or number/);
  assert.throws(() => verifyPort([]), /must be a string or number/);
  assert.throws(() => verifyPort([8080]), /must be a string or number/);
});

test('verifyPort throws for out-of-range values', () => {
  assert.throws(() => verifyPort(-1), /between 0 and 65535/);
  assert.throws(() => verifyPort(65536), /between 0 and 65535/);
  assert.throws(() => verifyPort(99999), /between 0 and 65535/);
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
