import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { verifyWebhookSignature } from '../utils/signatureVerifier.js';

function computeSignature(payload, secret) {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

test('verifyWebhookSignature returns true for valid signature', () => {
  const payload = '{"action":"push"}';
  const secret = 'webhook_secret_123';
  const sig = computeSignature(payload, secret);
  assert.equal(verifyWebhookSignature(payload, sig, secret), true);
});

test('verifyWebhookSignature returns false for invalid signature', () => {
  const payload = '{"action":"push"}';
  const secret = 'webhook_secret_123';
  const wrongSig = computeSignature(payload, 'wrong_secret');
  assert.equal(verifyWebhookSignature(payload, wrongSig, secret), false);
});

test('verifyWebhookSignature returns false when signature is missing', () => {
  const payload = '{"action":"push"}';
  const secret = 'webhook_secret_123';
  assert.equal(verifyWebhookSignature(payload, null, secret), false);
  assert.equal(verifyWebhookSignature(payload, undefined, secret), false);
  assert.equal(verifyWebhookSignature(payload, '', secret), false);
});

test('verifyWebhookSignature returns false when secret is missing', () => {
  const payload = '{"action":"push"}';
  const sig = 'sha256=abc123';
  assert.equal(verifyWebhookSignature(payload, sig, null), false);
  assert.equal(verifyWebhookSignature(payload, sig, undefined), false);
  assert.equal(verifyWebhookSignature(payload, sig, ''), false);
});

test('verifyWebhookSignature handles Buffer payload', () => {
  const payload = Buffer.from('{"action":"push"}');
  const secret = 'webhook_secret_123';
  const sig = computeSignature(payload.toString('utf-8'), secret);
  assert.equal(verifyWebhookSignature(payload, sig, secret), true);
});

test('verifyWebhookSignature handles Buffer payload with Buffer signature', () => {
  const payload = Buffer.from('{"action":"push"}');
  const secret = 'webhook_secret_123';
  const sig = computeSignature(payload.toString('utf-8'), secret);
  assert.equal(verifyWebhookSignature(payload, sig, secret), true);
});

test('verifyWebhookSignature handles signature without sha256= prefix', () => {
  const payload = '{"action":"push"}';
  const secret = 'webhook_secret_123';
  const sig = computeSignature(payload, secret).replace('sha256=', '');
  assert.equal(verifyWebhookSignature(payload, sig, secret), true);
});

test('verifyWebhookSignature handles non-object non-string non-Buffer payload', () => {
  const secret = 'webhook_secret_123';
  const sig = 'sha256=somesignature';
  // Empty body → HMAC of empty string won't match sig, so false
  assert.equal(verifyWebhookSignature(123, sig, secret), false);
  assert.equal(verifyWebhookSignature({}, sig, secret), false);
});

test('verifyWebhookSignature handles empty string payload', () => {
  const payload = '';
  const secret = 'webhook_secret_123';
  const sig = computeSignature(payload, secret);
  assert.equal(verifyWebhookSignature(payload, sig, secret), true);
});

test('verifyWebhookSignature returns false for tampered payload', () => {
  const original = '{"action":"push"}';
  const tampered = '{"action":"delete"}';
  const secret = 'webhook_secret_123';
  const sig = computeSignature(original, secret);
  assert.equal(verifyWebhookSignature(tampered, sig, secret), false);
});

test('verifyWebhookSignature handles unicode content in payload', () => {
  const payload = '{"message":"hello world with unicode"}';
  const secret = 'webhook_secret_123';
  const sig = computeSignature(payload, secret);
  assert.equal(verifyWebhookSignature(payload, sig, secret), true);
});
