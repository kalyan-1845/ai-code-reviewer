import crypto from 'crypto';

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

export function validateSessionSecret() {
  if (!process.env.SESSION_SECRET) {
    console.error('FATAL: SESSION_SECRET must be set independently of REPOSAGE_API_KEY');
    process.exit(1);
  }
  if (process.env.SESSION_SECRET === process.env.REPOSAGE_API_KEY) {
    console.error('FATAL: SESSION_SECRET must not be the same as REPOSAGE_API_KEY');
    process.exit(1);
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
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function decodeSessionCookie(req) {
  const cookieValue = getCookie(req, SESSION_COOKIE_NAME);
  if (!cookieValue) return null;

  const [payload, signature] = cookieValue.split('.');
  if (!payload || !signature) return null;

  const secret = getSessionSecret();
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

  res.cookie(SESSION_COOKIE_NAME, `${payload}.${signature}`, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS * 1000,
  });

  return {
    cookieHeader: `${SESSION_COOKIE_NAME}=${payload}.${signature}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; Secure`,
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
    // API key auth without cookie — derive clientId from a fresh UUID
    // so that any session created with this clientId is unique to this
    // request. The next response's Set-Cookie will bind subsequent
    // requests to the cookie's uid.
    req.clientId = crypto.randomUUID();
    next();
    return;
  }

  console.warn(`Unauthorized request attempt to ${req.originalUrl}`);
  return res.status(401).json({ error: 'Unauthorized: Invalid or missing API Key.' });
};
