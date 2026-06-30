import crypto from 'crypto';

export function verifyWebhookSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  // Ensure rawBody is treated as a string to prevent type errors in hmac.update
  const bodyStr = typeof rawBody === 'string' ? rawBody : '';
  const sig = signature.startsWith('sha256=') ? signature : `sha256=${signature}`;
  const hmac = crypto.createHmac('sha256', secret);
  const digest = `sha256=${hmac.update(bodyStr).digest('hex')}`;
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(digest);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return false;
  }
}
