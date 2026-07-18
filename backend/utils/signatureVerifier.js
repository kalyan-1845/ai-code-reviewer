import crypto from 'crypto';

export function verifyWebhookSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  // Ensure rawBody is treated as a string to prevent type errors in hmac.update
  const bodyStr = typeof rawBody === 'string' ? rawBody : Buffer.isBuffer(rawBody) ? rawBody.toString('utf-8') : '';
  const sig = signature.startsWith('sha256=') ? signature : `sha256=${signature}`;
  const hmac = crypto.createHmac('sha256', secret);
  const digest = `sha256=${hmac.update(bodyStr).digest('hex')}`;
  try {
    const a = crypto.createHash('sha256').update(Buffer.from(sig)).digest();
    const b = crypto.createHash('sha256').update(Buffer.from(digest)).digest();
    return crypto.timingSafeEqual(a, b);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return false;
  }
}
