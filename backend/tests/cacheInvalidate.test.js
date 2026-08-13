import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Unit tests for POST /api/cache/invalidate endpoint (backend/index.js lines 2007-2020).
// Tests cover: repoUrl validation, cache removal calls, and stats response.
// ---------------------------------------------------------------------------

function makeReqRes(overrides = {}) {
  const resHeaders = {};
  const res = {
    statusCode: null,
    body: null,
    getHeader(name) { return resHeaders[name.toLowerCase()]; },
    setHeader(name, value) { resHeaders[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  const req = {
    headers: {},
    clientId: 'test-client',
    body: {},
    ...overrides,
  };
  return { req, res };
}

// Inline the cache invalidate handler (mirrors backend/index.js lines 2007-2020)
async function cacheInvalidateHandler(req, res, analysisCache) {
  const { repoUrl } = req.body;
  if (!repoUrl) {
    return res.status(400).json({ error: 'repoUrl is required.' });
  }
  const removed = analysisCache.invalidateByRepoUrl(repoUrl);
  res.status(200).json({ success: true, removed, stats: analysisCache.getStats() });
}

// --- Tests ---

test('returns 200 with success when repoUrl is provided', async () => {
  const { req, res } = makeReqRes({ body: { repoUrl: 'https://github.com/test/repo' } });
  const mockCache = {
    invalidateByRepoUrl: (url) => {
      assert.equal(url, 'https://github.com/test/repo', 'should call invalidateByRepoUrl with repoUrl');
      return 3;
    },
    getStats: () => ({ size: 10, hits: 50, misses: 5 }),
  };

  await cacheInvalidateHandler(req, res, mockCache);

  assert.equal(res.statusCode, 200, 'should return 200');
  assert.equal(res.body.success, true, 'should return success=true');
  assert.equal(res.body.removed, 3, 'should return removed count');
  assert.ok(res.body.stats, 'should include stats');
});

test('returns 400 when repoUrl is missing', async () => {
  const { req, res } = makeReqRes({ body: {} });
  const mockCache = {
    invalidateByRepoUrl: () => 0,
    getStats: () => ({}),
  };

  await cacheInvalidateHandler(req, res, mockCache);

  assert.equal(res.statusCode, 400, 'should return 400 when repoUrl is missing');
  assert.ok(res.body.error.includes('repoUrl'), 'should include repoUrl in error message');
});

test('returns 400 when repoUrl is null', async () => {
  const { req, res } = makeReqRes({ body: { repoUrl: null } });
  const mockCache = {
    invalidateByRepoUrl: () => 0,
    getStats: () => ({}),
  };

  await cacheInvalidateHandler(req, res, mockCache);

  assert.equal(res.statusCode, 400, 'should return 400 when repoUrl is null');
});

test('returns 400 when repoUrl is empty string', async () => {
  const { req, res } = makeReqRes({ body: { repoUrl: '' } });
  const mockCache = {
    invalidateByRepoUrl: () => 0,
    getStats: () => ({}),
  };

  await cacheInvalidateHandler(req, res, mockCache);

  assert.equal(res.statusCode, 400, 'should return 400 when repoUrl is empty string');
});

test('returns stats from analysisCache.getStats()', async () => {
  const { req, res } = makeReqRes({ body: { repoUrl: 'https://github.com/test/repo' } });
  const expectedStats = { size: 42, hits: 100, misses: 10, evictions: 5 };
  const mockCache = {
    invalidateByRepoUrl: () => 1,
    getStats: () => expectedStats,
  };

  await cacheInvalidateHandler(req, res, mockCache);

  assert.deepEqual(res.body.stats, expectedStats, 'should return the exact stats from getStats()');
});

test('returns removed=0 when no cache entries match the repoUrl', async () => {
  const { req, res } = makeReqRes({ body: { repoUrl: 'https://github.com/nonexistent/repo' } });
  const mockCache = {
    invalidateByRepoUrl: () => 0,
    getStats: () => ({ size: 0, hits: 0, misses: 0 }),
  };

  await cacheInvalidateHandler(req, res, mockCache);

  assert.equal(res.statusCode, 200, 'should return 200');
  assert.equal(res.body.success, true, 'should return success=true');
  assert.equal(res.body.removed, 0, 'should return removed=0 when no entries match');
});
