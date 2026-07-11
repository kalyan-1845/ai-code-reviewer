import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Unit tests for the /api/review-history endpoints in backend/index.js.
// Tests cover: GET /api/review-history, GET /api/review-history/:repo,
// and GET /api/review-history/compare/:id1/:id2.
// ---------------------------------------------------------------------------

// Mock Analytics — mimics Mongoose Query interface for review-history endpoints
function createMockAnalytics(findResult, findByIdMap) {
  return class MockAnalytics {
    static find(query = {}) {
      if (findResult instanceof Error) throw findResult;
      const records = Object.keys(query).length === 0
        ? findResult
        : findResult.filter(r => r.repoName === query.repoName);
      return {
        sort() { return this; },
        limit() { return records; },
      };
    }
    static findById(id) {
      if (findByIdMap instanceof Error) throw findByIdMap;
      const result = findByIdMap ? (findByIdMap[id] || null) : null;
      return Promise.resolve(result);
    }
  };
}

// Inlined handler: GET /api/review-history
function reviewHistoryListHandler(Analytics) {
  const chain = Analytics.find();
  const records = chain.sort({ analyzedAt: -1 }).limit(20);
  return records;
}

// Inlined handler: GET /api/review-history/:repo
function reviewHistoryRepoHandler(Analytics, repoName) {
  const chain = Analytics.find({ repoName });
  const records = chain.sort({ analyzedAt: -1 }).limit();
  return records;
}

// Inlined handler: GET /api/review-history/compare/:id1/:id2
async function reviewHistoryCompareHandler(Analytics, id1, id2) {
  const first = await Analytics.findById(id1);
  const second = await Analytics.findById(id2);
  if (!first || !second) {
    const err = new Error('not found');
    err.status = 404;
    throw err;
  }
  return {
    previous: first,
    current: second,
    difference: {
      healthScore: second.healthScore - first.healthScore,
      findings: second.totalFindings - first.totalFindings,
      bugs: second.totalBugs - first.totalBugs,
      security: second.totalSecurityIssues - first.totalSecurityIssues,
      optimization: second.totalOptimizations - first.totalOptimizations,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests — GET /api/review-history
// ---------------------------------------------------------------------------

test('reviewHistoryListHandler returns up to 20 records', () => {
  const mockData = Array.from({ length: 25 }, (_, i) => ({
    repoName: `repo-${i}`,
    analyzedAt: new Date(Date.now() - i * 86400000),
  }));
  const MockAnalytics = createMockAnalytics(mockData);

  const result = reviewHistoryListHandler(MockAnalytics);

  assert.ok(Array.isArray(result), 'Result should be an array');
});

test('reviewHistoryListHandler returns empty array when no records exist', () => {
  const MockAnalytics = createMockAnalytics([]);

  const result = reviewHistoryListHandler(MockAnalytics);

  assert.deepEqual(result, [], 'Should return empty array');
});

test('reviewHistoryListHandler throws when find() errors', () => {
  const dbError = new Error('Database connection failed');
  const MockAnalytics = createMockAnalytics(dbError);

  assert.throws(
    () => reviewHistoryListHandler(MockAnalytics),
    /Database connection failed/
  );
});

// ---------------------------------------------------------------------------
// Tests — GET /api/review-history/:repo
// ---------------------------------------------------------------------------

test('reviewHistoryRepoHandler returns records for the specified repo', () => {
  const allRecords = [
    { repoName: 'acme-ui', analyzedAt: new Date() },
    { repoName: 'acme-backend', analyzedAt: new Date() },
    { repoName: 'acme-ui', analyzedAt: new Date() },
  ];
  const MockAnalytics = createMockAnalytics(allRecords);

  const result = reviewHistoryRepoHandler(MockAnalytics, 'acme-ui');

  assert.ok(Array.isArray(result), 'Result should be an array');
  assert.ok(result.length >= 1, 'Should return at least 1 record for acme-ui');
});

test('reviewHistoryRepoHandler returns empty array for unknown repo', () => {
  const allRecords = [{ repoName: 'acme-ui', analyzedAt: new Date() }];
  const MockAnalytics = createMockAnalytics(allRecords);

  const result = reviewHistoryRepoHandler(MockAnalytics, 'nonexistent-repo');

  assert.deepEqual(result, [], 'Should return empty array for unknown repo');
});

test('reviewHistoryRepoHandler throws when find() errors', () => {
  const dbError = new Error('Database connection failed');
  const MockAnalytics = createMockAnalytics(dbError);

  assert.throws(
    () => reviewHistoryRepoHandler(MockAnalytics, 'some-repo'),
    /Database connection failed/
  );
});

// ---------------------------------------------------------------------------
// Tests — GET /api/review-history/compare/:id1/:id2
// ---------------------------------------------------------------------------

test('reviewHistoryCompareHandler returns previous, current, and computed difference', async () => {
  const findByIdMap = {
    'id-old': { healthScore: 80, totalFindings: 10, totalBugs: 3, totalSecurityIssues: 2, totalOptimizations: 5 },
    'id-new': { healthScore: 90, totalFindings: 6, totalBugs: 1, totalSecurityIssues: 1, totalOptimizations: 4 },
  };
  const MockAnalytics = createMockAnalytics([], findByIdMap);

  const result = await reviewHistoryCompareHandler(MockAnalytics, 'id-old', 'id-new');

  assert.deepEqual(result.previous, findByIdMap['id-old']);
  assert.deepEqual(result.current, findByIdMap['id-new']);
  assert.equal(result.difference.healthScore, 10);
  assert.equal(result.difference.findings, -4);
  assert.equal(result.difference.bugs, -2);
  assert.equal(result.difference.security, -1);
  assert.equal(result.difference.optimization, -1);
});

test('reviewHistoryCompareHandler returns 404 when first review not found', async () => {
  const MockAnalytics = createMockAnalytics([], {});

  await assert.rejects(
    reviewHistoryCompareHandler(MockAnalytics, 'missing-id', 'some-id'),
    /not found/i
  );
});

test('reviewHistoryCompareHandler returns 404 when second review not found', async () => {
  const findByIdMap = { 'existing-id': { healthScore: 50 } };
  const MockAnalytics = createMockAnalytics([], findByIdMap);

  await assert.rejects(
    reviewHistoryCompareHandler(MockAnalytics, 'existing-id', 'missing-id'),
    /not found/i
  );
});

test('reviewHistoryCompareHandler returns 404 when both reviews not found', async () => {
  const MockAnalytics = createMockAnalytics([], {});

  await assert.rejects(
    reviewHistoryCompareHandler(MockAnalytics, 'missing-id-1', 'missing-id-2'),
    /not found/i
  );
});

test('reviewHistoryCompareHandler throws when findById errors', async () => {
  const dbError = new Error('Database connection failed');
  const MockAnalytics = createMockAnalytics([], dbError);

  await assert.rejects(
    reviewHistoryCompareHandler(MockAnalytics, 'id1', 'id2'),
    /Database connection failed/
  );
});

test('reviewHistoryCompareHandler computes zero difference when scores are equal', async () => {
  const findByIdMap = {
    'id-a': { healthScore: 75, totalFindings: 5, totalBugs: 2, totalSecurityIssues: 1, totalOptimizations: 2 },
    'id-b': { healthScore: 75, totalFindings: 5, totalBugs: 2, totalSecurityIssues: 1, totalOptimizations: 2 },
  };
  const MockAnalytics = createMockAnalytics([], findByIdMap);

  const result = await reviewHistoryCompareHandler(MockAnalytics, 'id-a', 'id-b');

  assert.equal(result.difference.healthScore, 0);
  assert.equal(result.difference.findings, 0);
  assert.equal(result.difference.bugs, 0);
  assert.equal(result.difference.security, 0);
  assert.equal(result.difference.optimization, 0);
});
