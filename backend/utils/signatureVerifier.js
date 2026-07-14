import crypto from 'crypto';

function verifyOneSecret(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const bodyStr = typeof rawBody === 'string' ? rawBody : Buffer.isBuffer(rawBody) ? rawBody.toString('utf-8') : '';
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

export function verifyWebhookSignature(rawBody, signature, secret) {
  return verifyOneSecret(rawBody, signature, secret);
}

export function verifyWebhookSignatureMulti(rawBody, signature, secrets) {
  if (!secrets || (Array.isArray(secrets) && secrets.length === 0)) return false;
  if (typeof secrets === 'string') {
    return verifyOneSecret(rawBody, signature, secrets);
  }
  for (const secret of secrets) {
    if (verifyOneSecret(rawBody, signature, secret)) {
      return true;
    }
  }
  return false;
}
