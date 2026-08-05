import crypto from 'crypto';

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(value) {
  return typeof value === 'string' && UUID_V4_RE.test(value);
}

export const SESSION_COOKIE_NAME = 'rps_v1_session';
const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;

function getConfiguredApiKey(res) {
  const validKey = process.env.REPOSAGE_API_KEY;
  if (!validKey) {
    console.error('SECURITY WARNING: REPOSAGE_API_KEY is not set in backend/.env');
    res.status(500).json({ error: 'Server misconfiguration: Authentication is not set up.' });
    return null;
  }
  return validKey;
}

function getSessionSecret() {
  if (!process.env.SESSION_SECRET) {
    console.error('SECURITY WARNING: SESSION_SECRET is not set in backend/.env');
    return null;
  }
  return process.env.SESSION_SECRET;
}

// Publicly-known default secrets that used to be shipped by the docker deploy
// path (docker-compose.yml fallbacks and .env.docker.example placeholders).
// If any of these is used at startup, cookie forging and full API auth bypass
// become trivial, so the process refuses to boot instead.
const KNOWN_DEFAULT_SECRETS = [
  'reposage-docker-dev-secret-key-change-in-prod-long-enough',
  'reposage-docker-dev-key-change-in-prod',
  'docker-dev-key',
  'change-me-to-a-random-secret',
  'change-me-to-a-random-api-key',
];

export function validateSessionSecret() {
  if (!process.env.SESSION_SECRET) {
    console.error('FATAL: SESSION_SECRET must be set independently of REPOSAGE_API_KEY');
    process.exit(1);
  }
  if (process.env.SESSION_SECRET === process.env.REPOSAGE_API_KEY) {
    console.error('FATAL: SESSION_SECRET must not be the same as REPOSAGE_API_KEY');
    process.exit(1);
  }
  for (const knownDefault of KNOWN_DEFAULT_SECRETS) {
    if (process.env.SESSION_SECRET === knownDefault) {
      console.error(`FATAL: SESSION_SECRET is set to the publicly-known default '${knownDefault}'. Set a strong random SESSION_SECRET before deploying.`);
      process.exit(1);
    }
    if (process.env.REPOSAGE_API_KEY === knownDefault) {
      console.error(`FATAL: REPOSAGE_API_KEY is set to the publicly-known default '${knownDefault}'. Set a strong random REPOSAGE_API_KEY before deploying.`);
      process.exit(1);
    }
  }
}

function signValue(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function getCookie(req, name) {
  const header = req.headers?.cookie;
  if (!header) return '';

  return header
    .split(';')
    .map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith(`${name}=`))
    ?.slice(name.length + 1) || '';
}

function safeEqual(left, right) {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  const a = crypto.createHash('sha256').update(leftBuffer).digest();
  const b = crypto.createHash('sha256').update(rightBuffer).digest();
  return crypto.timingSafeEqual(a, b);
}

function decodeSessionCookie(req) {
  const cookieValue = getCookie(req, SESSION_COOKIE_NAME);
  if (!cookieValue) return null;

  const [payload, signature] = cookieValue.split('.');
  if (!payload || !signature) return null;

  const secret = getSessionSecret();
  // Without a configured secret, signValue would throw TypeError in
  // createHmac. Treat the cookie as absent instead of crashing.
  if (!secret) return null;
  if (!safeEqual(signature, signValue(payload, secret))) return null;

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function createFrontendSessionCookie(res) {
  const validKey = getConfiguredApiKey(res);
  if (!validKey) return null;

  const sessionSecret = getSessionSecret();
  if (!sessionSecret) {
    console.error('FATAL: SESSION_SECRET is not configured');
    res.status(500).json({ error: 'Server misconfiguration: Session secret is not set up.' });
    return null;
  }

  const clientId = crypto.randomUUID();

  const payload = Buffer.from(
    JSON.stringify({ exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000, uid: clientId }),
  ).toString('base64url');
  const signature = signValue(payload, sessionSecret);
  const secureCookie = process.env.NODE_ENV === 'production';

  res.cookie(SESSION_COOKIE_NAME, `${payload}.${signature}`, {
    httpOnly: true,
    secure: secureCookie,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS * 1000,
    expires: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
  });

  return {
    cookieHeader: `${SESSION_COOKIE_NAME}=${payload}.${signature}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; Expires=${new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toUTCString()}${secureCookie ? '; Secure' : ''}`,
    clientId,
  };
}

export const requireApiKey = (req, res, next) => {
  const validKey = getConfiguredApiKey(res);
  if (!validKey) return;

  const providedKey = Array.isArray(req.headers['x-api-key'])
    ? req.headers['x-api-key'][0]
    : req.headers['x-api-key'];

  const sessionSecret = getSessionSecret();

  // When a valid session cookie exists, use its uid as clientId.
  // This gives each browser/client a unique identifier, preventing
  // cross-user session access even when the API key is shared.
  const cookieData = decodeSessionCookie(req);
  if (cookieData && Number.isFinite(cookieData.exp) && cookieData.exp > Date.now()) {
    req.clientId = cookieData.uid;
    next();
    return;
  }

  if (providedKey && safeEqual(providedKey, validKey)) {
    // API key auth without cookie. The shared API key is identical for every
    // cookie-less caller, so a per-request UUID would give each request a
    // fresh identity and defeat the concurrency throttle (and every other
    // per-user budget keyed on clientId). Derive a stable clientId from the
    // API key and the caller's IP instead: the same caller always resolves to
    // the same key, so limits actually engage, while different IPs still get
    // distinct identities. req.ip is the trust-proxy-resolved client address
    // (the raw X-Forwarded-For leftmost entry is never used, matching the
    // rate-limiter contract).
    const callerIp = req.ip || req.socket?.remoteAddress || 'unknown';
    req.clientId = crypto
      .createHash('sha256')
      .update(`${providedKey}:${callerIp}`)
      .digest('hex');
    next();
    return;
  }

  console.warn(`Unauthorized request attempt to ${req.originalUrl}`);
  return res.status(401).json({ error: 'Unauthorized: Invalid or missing API Key.' });
};
