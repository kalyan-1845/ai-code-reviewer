import crypto from 'crypto';

/**
 * Verify a GitHub webhook HMAC-SHA256 signature.
 * When a timestamp header is provided, the body is prefixed with
 * `{timestamp}.` before HMAC computation (GitHub's current
 * best practice for replay protection). The timestamp is also
 * validated to reject deliveries older than MAX_AGE_MS.
 */
const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

export function verifyWebhookSignature(rawBody, signature, secret, timestamp) {
  if (!signature || !secret) return false;

  // Reject signatures older than MAX_AGE_MS to prevent replay attacks
  if (timestamp) {
    const ts = parseInt(timestamp, 10);
    if (!Number.isFinite(ts) || Date.now() - ts > MAX_AGE_MS) {
      console.warn('Webhook timestamp is missing, invalid, or expired');
      return false;
    }
  }

  const bodyStr = typeof rawBody === 'string' ? rawBody : Buffer.isBuffer(rawBody) ? rawBody.toString('utf-8') : '';
  const sig = signature.startsWith('sha256=') ? signature : `sha256=${signature}`;

  // When a timestamp is present, GitHub's newer signing scheme prefixes
  // the payload with `{timestamp}.` before computing the HMAC.
  const hmacPayload = timestamp ? `${timestamp}.${bodyStr}` : bodyStr;
  const hmac = crypto.createHmac('sha256', secret);
  const digest = `sha256=${hmac.update(hmacPayload).digest('hex')}`;

  try {
    const a = crypto.createHash('sha256').update(Buffer.from(sig)).digest();
    const b = crypto.createHash('sha256').update(Buffer.from(digest)).digest();
    return crypto.timingSafeEqual(a, b);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return false;
  }
}
