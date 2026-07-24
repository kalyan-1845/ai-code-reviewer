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

test('verifyHost returns valid hostnames unchanged (trimmed)', () => {
  assert.equal(verifyHost('  127.0.0.1  '), '127.0.0.1');
  assert.equal(verifyHost('localhost'), 'localhost');
  assert.equal(verifyHost('example.com'), 'example.com');
  assert.equal(verifyHost('192.168.1.1'), '192.168.1.1');
  assert.equal(verifyHost('api.my-service.io'), 'api.my-service.io');
  assert.equal(verifyHost('0.0.0.0'), '0.0.0.0');
  assert.equal(verifyHost('[::1]'), '[::1]');
});

test('verifyHost returns localhost for empty/whitespace/non-string inputs', () => {
  assert.equal(verifyHost(''), 'localhost');
  assert.equal(verifyHost('   '), 'localhost');
  assert.equal(verifyHost(null), 'localhost');
  assert.equal(verifyHost(undefined), 'localhost');
  assert.equal(verifyHost(123), 'localhost');
  assert.equal(verifyHost({}), 'localhost');
  assert.equal(verifyHost([]), 'localhost');
});

test('verifyHost trims whitespace from valid hostnames', () => {
  assert.equal(verifyHost('  api.example.com  '), 'api.example.com');
  assert.equal(verifyHost('\tlocalhost\t'), 'localhost');
  assert.equal(verifyHost('\nmyhost.io\n'), 'myhost.io');
});

// --- Additional edge-case tests for verifyPort ---
test('verifyPort rejects port -1', () => {
  // String '-1' fails the /^\d+$/ regex check first
  assert.throws(() => verifyPort('-1'), /non-numeric/);
  // Number -1 passes type check, but fails integer range
  assert.throws(() => verifyPort(-1), /between 0 and 65535/);
});

test('verifyPort accepts port 65535 at upper boundary', () => {
  assert.equal(verifyPort(65535), 65535);
  assert.equal(verifyPort('65535'), 65535);
});

test('verifyPort accepts port 0 at lower boundary', () => {
  assert.equal(verifyPort(0), 0);
  assert.equal(verifyPort('0'), 0);
});

test('verifyPort rejects whitespace-padded string ports', () => {
  // Whitespace-padded strings fail the regex /^\d+$/
  assert.throws(() => verifyPort(' 8080'), /non-numeric/);
  assert.throws(() => verifyPort('8080 '), /non-numeric/);
  assert.throws(() => verifyPort(' 8080 '), /non-numeric/);
});

test('verifyPort rejects very large integer strings', () => {
  assert.throws(() => verifyPort('999999'), /between 0 and 65535/);
  assert.throws(() => verifyPort('100000'), /between 0 and 65535/);
});

test('verifyPort handles leading zeros', () => {
  assert.equal(verifyPort('0080'), 80);
  assert.equal(verifyPort('03000'), 3000);
});

test('verifyPort rejects NaN and Infinity', () => {
  // NaN is typeof 'number' so passes type check, but Number.isInteger(NaN) is false
  assert.throws(() => verifyPort(NaN), /between 0 and 65535/);
  // Infinity is a number, but is not a finite integer
  assert.throws(() => verifyPort(Infinity), /between 0 and 65535/);
});
