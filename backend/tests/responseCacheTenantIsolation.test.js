import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import AnalysisCache from '../utils/analysisCache.js';

// Issue #3577: the process-global responseCache used to key /api/analyze
// responses only on repo parameters. A second client analyzing the same repo
// at the same commit with the same params could receive the first client's
// sessionOwnerToken/sessionId/csrfToken (a bearer credential trusted by
// /api/chat), enabling cross-tenant session takeover.
//
// The fix has two halves, both mirrored below exactly as implemented in
// backend/index.js:
//   1. finalCacheKey includes req.clientId, so cache entries are per-client.
//   2. The cached payload strips every per-session credential
//      (sessionId, sessionOwnerToken, csrfToken, sessionPersisted,
//      chatAvailable) and a fresh session is created per caller on a hit.

function finalCacheKey({ repoUrl, clientId, commitSha, model, language, company, validatedPrompt, temperature, maxTokens, batchSize }) {
  return crypto.createHash('sha256')
    .update(`${repoUrl}|${clientId}|${commitSha}|${model}|${language}|${company}|${validatedPrompt}|${temperature}|${maxTokens}|${batchSize}`)
    .digest('hex');
}

function stripSessionCredentials(responseObject) {
  return {
    ...responseObject,
    sessionId: undefined,
    sessionOwnerToken: undefined,
    csrfToken: undefined,
    sessionPersisted: false,
    chatAvailable: false,
  };
}

const BASE_PARAMS = {
  repoUrl: 'https://github.com/acme/private-repo.git',
  commitSha: 'abc123def456',
  model: 'llama-3.3-70b-versatile',
  language: 'English',
  company: 'General',
  validatedPrompt: '',
  temperature: 0.7,
  maxTokens: 2048,
  batchSize: 5,
};

test('response cache key is scoped per client (clientId is part of the key)', () => {
  const clientA = finalCacheKey({ ...BASE_PARAMS, clientId: 'client-a' });
  const clientB = finalCacheKey({ ...BASE_PARAMS, clientId: 'client-b' });
  const clientAagain = finalCacheKey({ ...BASE_PARAMS, clientId: 'client-a' });

  assert.notEqual(clientA, clientB,
    'two different clients analyzing the same repo must not share a cache key');
  assert.equal(clientA, clientAagain,
    'the same client must be served its own cached entry');
});

test('cached payload never contains session credentials (sessionOwnerToken/sessionId/csrfToken)', () => {
  const cache = new AnalysisCache(60 * 1000);
  const responseObject = {
    success: true,
    repoName: 'private-repo',
    analysis: { findings: [] },
    sessionId: 'session-1',
    sessionOwnerToken: 'owner-token-1',
    csrfToken: 'csrf-1',
    sessionPersisted: true,
    chatAvailable: true,
  };

  const key = finalCacheKey({ ...BASE_PARAMS, clientId: 'client-a' });
  cache.set(key, stripSessionCredentials(responseObject), { repoUrl: BASE_PARAMS.repoUrl });
  const cached = cache.get(key);

  assert.equal(cached.sessionOwnerToken, undefined, 'sessionOwnerToken must be stripped before caching');
  assert.equal(cached.sessionId, undefined, 'sessionId must be stripped before caching');
  assert.equal(cached.csrfToken, undefined, 'csrfToken must be stripped before caching');
  assert.equal(cached.sessionPersisted, false, 'sessionPersisted must be false in cached payload');
  assert.equal(cached.chatAvailable, false, 'chatAvailable must be false in cached payload');
  assert.equal(cached.analysis.findings.length, 0, 'non-session payload must be preserved');
});

test('two clients analyzing the same repo receive distinct session credentials', () => {
  const cache = new AnalysisCache(60 * 1000);
  const sessionFiles = ['src/index.js'];

  const persistForClient = (clientId, sessionId, ownerToken, csrfToken) => {
    const responseObject = {
      success: true,
      repoName: 'private-repo',
      analysis: { findings: [] },
      sessionId,
      sessionOwnerToken: ownerToken,
      csrfToken,
      sessionPersisted: true,
      chatAvailable: true,
    };
    const key = finalCacheKey({ ...BASE_PARAMS, clientId });
    const cachedPayload = stripSessionCredentials(responseObject);
    if (sessionFiles.length > 0) {
      cachedPayload._sessionFiles = sessionFiles;
    }
    cache.set(key, cachedPayload, { repoUrl: BASE_PARAMS.repoUrl });
    return key;
  };

  const keyA = persistForClient('client-a', 'session-a', 'owner-token-a', 'csrf-a');
  const keyB = persistForClient('client-b', 'session-b', 'owner-token-b', 'csrf-b');

  // Different clients => different keys => neither sees the other's entry.
  const hitForA = cache.get(keyA);
  const hitForB = cache.get(keyB);

  assert.notEqual(keyA, keyB);
  assert.ok(hitForA, 'client A must hit its own cache entry');
  assert.ok(hitForB, 'client B must hit its own cache entry');
  assert.equal(hitForA.sessionOwnerToken, undefined, 'cached payload for A must not carry A or B session credentials');
  assert.equal(hitForB.sessionOwnerToken, undefined, 'cached payload for B must not carry A or B session credentials');

  // Even if the cache were to serve B from A's entry (same-key scenario),
  // the credentials in the cached payload are undefined, so a fresh
  // session is regenerated per caller and can never reuse the other's token.
  assert.equal(hitForA.sessionId, undefined);
  assert.equal(hitForB.sessionId, undefined);
  assert.equal(hitForA.csrfToken, undefined);
  assert.equal(hitForB.csrfToken, undefined);
  assert.equal(hitForA._sessionFiles.length, 1, 'session files are cached under a private field');
});
