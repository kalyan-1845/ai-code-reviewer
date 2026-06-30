import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { verifyWebhookSignature } from '../utils/signatureVerifier.js';

test('verifyWebhookSignature should validate signatures correctly', () => {
  const secret = 'my_secret_token';
  const rawBody = JSON.stringify({ action: 'opened', pull_request: {} });
  
  const hmac = crypto.createHmac('sha256', secret);
  const expectedSignature = `sha256=${hmac.update(rawBody).digest('hex')}`;

  const isValid = verifyWebhookSignature(rawBody, expectedSignature, secret);
  assert.equal(isValid, true);
});

test('verifyWebhookSignature should fail on invalid signature', () => {
  const isValid = verifyWebhookSignature('body', 'sha256=invalidhash', 'secret');
  assert.equal(isValid, false);
});

test('verifyWebhookSignature should fail on missing signature or secret', () => {
  assert.equal(verifyWebhookSignature('body', '', 'secret'), false);
  assert.equal(verifyWebhookSignature('body', 'sig', ''), false);
});

test('verifyWebhookSignature should handle unicode body content correctly', () => {
  const secret = 'webhook_secret';
  // Chinese, Arabic, and emoji characters
  const rawBody = JSON.stringify({ message: '你好世界 مرحبا hello 🌍' });
  const hmac = crypto.createHmac('sha256', secret);
  const expectedSignature = `sha256=${hmac.update(rawBody).digest('hex')}`;

  const isValid = verifyWebhookSignature(rawBody, expectedSignature, secret);
  assert.equal(isValid, true);
});

test('verifyWebhookSignature should handle very long body strings', () => {
  const secret = 'long_secret';
  // 20KB body
  const rawBody = 'x'.repeat(20 * 1024);
  const hmac = crypto.createHmac('sha256', secret);
  const expectedSignature = `sha256=${hmac.update(rawBody).digest('hex')}`;

  const isValid = verifyWebhookSignature(rawBody, expectedSignature, secret);
  assert.equal(isValid, true);
});

test('verifyWebhookSignature should work with signature without sha256= prefix', () => {
  const secret = 'prefix_test';
  const rawBody = JSON.stringify({ action: 'closed' });
  const hmac = crypto.createHmac('sha256', secret);
  // Signature without the sha256= prefix - function should prepend it
  const sigWithoutPrefix = hmac.update(rawBody).digest('hex');

  const isValid = verifyWebhookSignature(rawBody, sigWithoutPrefix, secret);
  assert.equal(isValid, true);
});

test('verifyWebhookSignature should handle empty string body', () => {
  const secret = 'empty_secret';
  const rawBody = '';
  const hmac = crypto.createHmac('sha256', secret);
  const expectedSignature = `sha256=${hmac.update(rawBody).digest('hex')}`;

  const isValid = verifyWebhookSignature(rawBody, expectedSignature, secret);
  assert.equal(isValid, true);
});

test('verifyWebhookSignature should handle null/undefined body gracefully', () => {
  const secret = 'null_secret';
  const hmac = crypto.createHmac('sha256', secret);
  const expectedSignature = `sha256=${hmac.update('').digest('hex')}`;

  // null body should be treated as empty string
  const isValidNull = verifyWebhookSignature(null, expectedSignature, secret);
  assert.equal(isValidNull, true);

  // undefined body should be treated as empty string
  const isValidUndefined = verifyWebhookSignature(undefined, expectedSignature, secret);
  assert.equal(isValidUndefined, true);
});

test('verifyWebhookSignature should return false for non-string body types', () => {
  const secret = 'type_test';
  const hmac = crypto.createHmac('sha256', secret);
  // Signature computed from 'body' string
  const expectedSignature = `sha256=${hmac.update('body').digest('hex')}`;

  // Non-string body types (number, boolean, object) are treated as empty string,
  // so HMAC digest differs from the expected one -> returns false
  assert.equal(verifyWebhookSignature(123, expectedSignature, secret), false);
  assert.equal(verifyWebhookSignature(true, expectedSignature, secret), false);
  assert.equal(verifyWebhookSignature({}, expectedSignature, secret), false);
  assert.equal(verifyWebhookSignature(['array'], expectedSignature, secret), false);
});

test('verifyWebhookSignature should return false when signature is only whitespace', () => {
  const result = verifyWebhookSignature('body', '   ', 'secret');
  assert.equal(result, false);
});

test('verifyWebhookSignature should return false for null signature', () => {
  const result = verifyWebhookSignature('body', null, 'secret');
  assert.equal(result, false);
});

test('verifyWebhookSignature should return false for null secret', () => {
  const result = verifyWebhookSignature('body', 'sha256=abc123', null);
  assert.equal(result, false);
});

test('verifyWebhookSignature should return false for mismatched digest lengths', () => {
  const secret = 'mismatch_test';
  // Create a valid signature for the body
  const rawBody = JSON.stringify({ test: 'data' });
  const hmac = crypto.createHmac('sha256', secret);
  const validSig = `sha256=${hmac.update(rawBody).digest('hex')}`;

  // A mismatched-length signature (too short) would trigger timingSafeEqual to throw
  // The function should catch this and return false
  const shortSig = 'sha256=abc';
  const result = verifyWebhookSignature(rawBody, shortSig, secret);
  assert.equal(result, false);
});
