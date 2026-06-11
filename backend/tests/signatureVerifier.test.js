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
