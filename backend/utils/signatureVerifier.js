import crypto from 'crypto';

export function verifyWebhookSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const sig = signature.startsWith('sha256=') ? signature : `sha256=${signature}`;
  const hmac = crypto.createHmac('sha256', secret);
  const digest = `sha256=${hmac.update(rawBody || '').digest('hex')}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(digest));
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return false;
  }
}
