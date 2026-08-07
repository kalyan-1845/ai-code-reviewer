/**
 * AI Engine URL resolution.
 *
 * The AI engine endpoints must never be reached over cleartext HTTP unless the
 * address is loopback (localhost / 127.0.0.1 / ::1), which carries no transport
 * risk. Any other value — including a misconfigured http:// host — is rejected
 * and falls back to the loopback default so a bad config surfaces loudly
 * instead of silently shipping review diffs to an unencrypted endpoint.
 */
export function resolveAiEngineUrl(rawEnv) {
  const raw = (rawEnv || '').trim().replace(/\/+$/, '');
  if (!raw) {
    return { url: 'http://localhost:8000', warnings: [] };
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch (err) {
    return {
      url: 'http://localhost:8000',
      warnings: [`AI_ENGINE_URL is not a valid URL: "${raw}"`],
    };
  }

  const hostname = parsed.hostname;
  const loopback =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]';

  if (parsed.protocol === 'https:' || loopback) {
    return { url: raw, warnings: [] };
  }

  return {
    url: 'http://localhost:8000',
    warnings: [
      `AI_ENGINE_URL must use https or loopback localhost; got "${raw}". Falling back to http://localhost:8000.`,
    ],
  };
}