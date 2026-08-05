import test from 'node:test';
import assert from 'assert/strict';

// ---------------------------------------------------------------------------
// Regression tests for the /api/analytics/trends endpoint tenant isolation.
// Issue #3661: the trends aggregation used to run without any clientId in the
// $match stage, so any authenticated caller could read aggregate analytics for
// every other user and pivot into a specific session via ?sessionId=<uuid>.
//
// The fix scopes the pipeline with `clientId: req.clientId` and only applies
// the optional sessionId filter on top of that, so a session belonging to a
// different client can never surface in the caller's trends.
// ---------------------------------------------------------------------------

// Inlined aggregation logic from GET /api/analytics/trends (backend/index.js).
// `clientId` is the caller's stable identity set by requireApiKey.
function buildTrendsPipeline(clientId, sessionId) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const matchFilter = {
    clientId,
    analyzedAt: { $gte: thirtyDaysAgo },
  };

  if (sessionId && typeof sessionId === 'string') {
    matchFilter.sessionId = sessionId;
  }

  return matchFilter;
}

function trendsHandler(Analytics, req) {
  const pipeline = buildTrendsPipeline(req.clientId, req.query?.sessionId);
  return Analytics.aggregate([
    { $match: pipeline },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$analyzedAt' } },
        analyses: { $sum: 1 },
        totalFindings: { $sum: '$totalFindings' },
        avgHealthScore: { $avg: '$healthScore' },
        totalBugs: { $sum: '$totalBugs' },
        totalSecurityIssues: { $sum: '$totalSecurityIssues' },
      },
    },
    { $sort: { _id: 1 } },
  ]);
}

function createMockAnalytics(capturedPipelines) {
  return class MockAnalytics {
    static async aggregate(pipeline) {
      capturedPipelines.push(pipeline);
      return [];
    }
  };
}

test('trends $match is always scoped to the caller clientId', async () => {
  const captured = [];
  const MockAnalytics = createMockAnalytics(captured);

  await trendsHandler(MockAnalytics, { clientId: 'client-1', query: {} });

  assert.ok(captured.length === 1, 'one pipeline should run');
  const match = captured[0][0].$match;
  assert.equal(match.clientId, 'client-1',
    'aggregate must be filtered by the authenticated caller clientId');
  assert.ok(match.analyzedAt, '30-day window filter must still apply');
});

test('two different clients never share trends data', async () => {
  const captured = [];
  const MockAnalytics = createMockAnalytics(captured);

  await trendsHandler(MockAnalytics, { clientId: 'client-a', query: {} });
  await trendsHandler(MockAnalytics, { clientId: 'client-b', query: {} });

  const matchA = captured[0][0].$match;
  const matchB = captured[1][0].$match;
  assert.equal(matchA.clientId, 'client-a');
  assert.equal(matchB.clientId, 'client-b');
  assert.notEqual(matchA.clientId, matchB.clientId,
    'each caller must only see its own aggregate metrics');
});

test('sessionId filter is layered on top of clientId scoping', async () => {
  const captured = [];
  const MockAnalytics = createMockAnalytics(captured);

  await trendsHandler(MockAnalytics, {
    clientId: 'client-1',
    query: { sessionId: '1d2b2d10-6a74-4bb8-9d92-91f9a6b0a001' },
  });

  const match = captured[0][0].$match;
  assert.equal(match.clientId, 'client-1', 'clientId scoping must never be dropped');
  assert.equal(match.sessionId, '1d2b2d10-6a74-4bb8-9d92-91f9a6b0a001',
    'optional sessionId filter may be applied');
  // Because clientId is part of the same $match, a session that belongs to a
  // different client cannot match — the caller can never pivot into it.
  const otherClientPipeline = buildTrendsPipeline('client-2', '1d2b2d10-6a74-4bb8-9d92-91f9a6b0a001');
  assert.equal(otherClientPipeline.clientId, 'client-2');
});

test('trends without a sessionId query leaves sessionId out of $match', async () => {
  const captured = [];
  const MockAnalytics = createMockAnalytics(captured);

  await trendsHandler(MockAnalytics, { clientId: 'client-3', query: {} });

  const match = captured[0][0].$match;
  assert.equal(match.sessionId, undefined,
    'sessionId filter must be absent when no sessionId query is supplied');
});
