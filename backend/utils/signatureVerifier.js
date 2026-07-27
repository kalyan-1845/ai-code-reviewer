import crypto from 'crypto';

export function verifyWebhookSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;

  const bodyStr = typeof rawBody === 'string'
    ? rawBody
    : Buffer.isBuffer(rawBody)
      ? rawBody.toString('utf-8')
      : '';

  const hmac = crypto.createHmac('sha256', secret).update(bodyStr);
  const expected = `sha256=${hmac.digest('hex')}`;
  const received = signature.startsWith('sha256=') ? signature : `sha256=${signature}`;

  if (received.length !== expected.length) return false;

  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}
