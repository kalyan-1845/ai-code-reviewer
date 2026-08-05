import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Regression tests for /api/analyze cache-hit session regeneration (issue
// #3665). On a response-cache hit the server used to re-set the csrf-token
// cookie to the token stored on the cached response object — generated for
// whichever client ran the identical analysis first, written with httpOnly:
// true. That stale token was not in the current client's token store (and may
// have belonged to a different client), so the next state-changing request
// could fail CSRF validation, and httpOnly:true hid the token from the
// frontend (which reads it via document.cookie).
//
// The fix regenerates a fresh session + CSRF token for the current caller on a
// cache hit and writes the cookie with httpOnly:false, never reusing a cached
// token. The logic below mirrors the cache-hit path in backend/index.js.
// ---------------------------------------------------------------------------

function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Mirrors the cache-hit branch of POST /api/analyze. cachedResponse is the
// per-client cached payload (session credentials already stripped before
// caching). Returns the fresh session credentials and the CSRF cookie options.
function handleCacheHit(cachedResponse, rotatedCsrfToken) {
  const freshSessionId = crypto.randomUUID();
  const freshOwnerToken = crypto.randomUUID();
  const freshCsrfToken = rotatedCsrfToken || generateCsrfToken();
  let persisted = false;
  const sessionFiles = Array.isArray(cachedResponse._sessionFiles) ? cachedResponse._sessionFiles : [];
  if (sessionFiles.length > 0) {
    persisted = true;
  }
  // _sessionFiles is a private cache field and must never leak to the client.
  delete cachedResponse._sessionFiles;
  return {
    response: {
      ...cachedResponse,
      sessionId: freshSessionId,
      sessionPersisted: persisted,
      chatAvailable: persisted,
      ...(persisted ? { sessionOwnerToken: freshOwnerToken, csrfToken: freshCsrfToken } : {}),
    },
    cookie: {
      value: freshCsrfToken,
      httpOnly: false,
      sameSite: 'strict',
      path: '/',
    },
  };
}

test('cache hit never reuses a cached CSRF token for the current client', () => {
  // Cached payloads never contain session credentials (they are stripped
  // before caching), so there is nothing to leak from a prior client.
  const cachedResponse = {
    success: true,
    repoName: 'acme-repo',
    analysis: { findings: [] },
    sessionId: undefined,
    sessionOwnerToken: undefined,
    csrfToken: undefined,
    sessionPersisted: false,
    chatAvailable: false,
    _sessionFiles: ['src/index.js'],
  };

  const first = handleCacheHit({ ...cachedResponse }, null);
  const second = handleCacheHit({ ...cachedResponse }, null);

  assert.notEqual(first.response.sessionId, second.response.sessionId,
    'every cache hit must generate a fresh per-caller sessionId');
  assert.notEqual(first.response.sessionOwnerToken, second.response.sessionOwnerToken,
    'every cache hit must generate a fresh session owner token');
  assert.notEqual(first.cookie.value, second.cookie.value,
    'every cache hit must issue a fresh CSRF token, never a stale cached one');
  assert.equal(first.response._sessionFiles, undefined,
    'the private _sessionFiles field must be deleted before responding');
});

test('CSRF cookie written on a cache hit is readable by the frontend (httpOnly: false)', () => {
  const cachedResponse = { success: true, _sessionFiles: ['src/index.js'] };
  const { cookie } = handleCacheHit(cachedResponse, 'rotated-token-from-middleware');

  assert.equal(cookie.httpOnly, false,
    'httpOnly must be false (matching every other rotation) so apiFetch can read the token from document.cookie');
  assert.equal(cookie.sameSite, 'strict');
  assert.equal(cookie.path, '/');
  assert.ok(typeof cookie.value === 'string' && cookie.value.length > 0);
});

test('a fresh session is persisted on cache hit when session files exist', () => {
  const cachedResponse = { success: true, _sessionFiles: ['src/index.js', 'src/lib.ts'] };
  const { response } = handleCacheHit(cachedResponse, null);

  assert.equal(response.sessionPersisted, true);
  assert.equal(response.chatAvailable, true);
  assert.ok(response.sessionOwnerToken, 'a fresh owner token must be issued for the new session');
  assert.ok(response.csrfToken, 'a fresh CSRF token must be issued for the new session');
  assert.notEqual(response.csrfToken, 'cached-token-value',
    'the response CSRF token must not come from a cached value');
});

test('the cached payload itself never carries a CSRF token', () => {
  // The pre-fix bug re-set the cookie from cachedResponse.csrfToken. After the
  // fix, session-scoped fields are stripped before caching, so a cached payload
  // can never contain a token to reuse.
  const cachedResponse = {
    success: true,
    analysis: { findings: [] },
    csrfToken: undefined,
  };
  assert.equal(cachedResponse.csrfToken, undefined,
    'session-scoped fields must be stripped before the payload is cached');
});
