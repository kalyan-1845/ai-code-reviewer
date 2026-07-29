import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Unit tests for GET /api/roi endpoint (backend/index.js lines 1586-1622).
// Tests cover: metrics aggregation, acceptance rate calculation, timeSavedHours
// formatting, and zero-division handling.
// ---------------------------------------------------------------------------

function makeReqRes() {
  const resHeaders = {};
  const res = {
    statusCode: null,
    body: null,
    getHeader(name) { return resHeaders[name.toLowerCase()]; },
    setHeader(name, value) { resHeaders[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  return { res };
}

// Mock RoiMetrics - mirrors the mongoose model's shape used by the ROI handler
function createMockRoiMetrics(findResult) {
  return {
    find: async (query) => findResult,
  };
}

// Inline the ROI endpoint handler (mirrors backend/index.js lines 1586-1622)
async function roiHandler(res, mockMetrics) {
  try {
    const metrics = await mockMetrics.find({});
    const aggregated = metrics.reduce((acc, curr) => {
      acc.totalPrsReviewed += curr.totalPrsReviewed;
      acc.totalAiComments += curr.totalAiComments;
      acc.acceptedSuggestions += curr.acceptedSuggestions;
      acc.timeSavedMinutes += curr.timeSavedMinutes;
      return acc;
    }, {
      totalPrsReviewed: 0,
      totalAiComments: 0,
      acceptedSuggestions: 0,
      timeSavedMinutes: 0
    });
    const acceptanceRate = aggregated.totalAiComments > 0
      ? ((aggregated.acceptedSuggestions / aggregated.totalAiComments) * 100).toFixed(1)
      : 0;
    const timeSavedHours = (aggregated.timeSavedMinutes / 60).toFixed(1);
    res.status(200).json({
      metrics,
      aggregated: {
        ...aggregated,
        acceptanceRate,
        timeSavedHours
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch ROI metrics' });
  }
}

test('returns 200 with aggregated metrics when metrics exist', async () => {
  const { res } = makeReqRes();
  const mockMetrics = createMockRoiMetrics([
    { totalPrsReviewed: 10, totalAiComments: 20, acceptedSuggestions: 5, timeSavedMinutes: 75 },
    { totalPrsReviewed: 5, totalAiComments: 10, acceptedSuggestions: 2, timeSavedMinutes: 30 },
  ]);

  await roiHandler(res, mockMetrics);

  assert.equal(res.statusCode, 200, 'should return 200');
  assert.equal(res.body.aggregated.totalPrsReviewed, 15, 'should sum totalPrsReviewed');
  assert.equal(res.body.aggregated.totalAiComments, 30, 'should sum totalAiComments');
  assert.equal(res.body.aggregated.acceptedSuggestions, 7, 'should sum acceptedSuggestions');
  assert.equal(res.body.aggregated.timeSavedMinutes, 105, 'should sum timeSavedMinutes');
});

test('acceptanceRate is computed as (acceptedSuggestions / totalAiComments) * 100', async () => {
  const { res } = makeReqRes();
  const mockMetrics = createMockRoiMetrics([
    { totalPrsReviewed: 10, totalAiComments: 20, acceptedSuggestions: 5, timeSavedMinutes: 0 },
  ]);

  await roiHandler(res, mockMetrics);

  assert.equal(res.body.aggregated.acceptanceRate, '25.0', 'acceptanceRate should be 25.0%');
});

test('timeSavedHours is totalTimeSavedMinutes / 60 formatted to 1 decimal', async () => {
  const { res } = makeReqRes();
  const mockMetrics = createMockRoiMetrics([
    { totalPrsReviewed: 1, totalAiComments: 1, acceptedSuggestions: 1, timeSavedMinutes: 75 },
  ]);

  await roiHandler(res, mockMetrics);

  assert.equal(res.body.aggregated.timeSavedHours, '1.3', 'timeSavedHours should be 1.3 for 75 minutes');
});

test('returns acceptanceRate as 0 when totalAiComments is 0 (no division by zero)', async () => {
  const { res } = makeReqRes();
  const mockMetrics = createMockRoiMetrics([
    { totalPrsReviewed: 5, totalAiComments: 0, acceptedSuggestions: 0, timeSavedMinutes: 0 },
  ]);

  await roiHandler(res, mockMetrics);

  assert.equal(res.body.aggregated.acceptanceRate, 0, 'acceptanceRate should be 0 when no comments');
  assert.equal(res.body.aggregated.timeSavedHours, '0.0', 'timeSavedHours should be 0.0');
});

test('returns 500 on database error', async () => {
  const { res } = makeReqRes();
  const mockMetrics = {
    find: async () => { throw new Error('DB error'); },
  };

  await roiHandler(res, mockMetrics);

  assert.equal(res.statusCode, 500, 'should return 500 on error');
  assert.ok(res.body.error.includes('Failed to fetch'), 'should return error message');
});

test('returns empty aggregated when no metrics exist', async () => {
  const { res } = makeReqRes();
  const mockMetrics = createMockRoiMetrics([]);

  await roiHandler(res, mockMetrics);

  assert.equal(res.statusCode, 200, 'should return 200');
  assert.equal(res.body.aggregated.totalPrsReviewed, 0, 'totalPrsReviewed should be 0');
  assert.equal(res.body.aggregated.totalAiComments, 0, 'totalAiComments should be 0');
  assert.equal(res.body.aggregated.acceptedSuggestions, 0, 'acceptedSuggestions should be 0');
  assert.equal(res.body.aggregated.timeSavedMinutes, 0, 'timeSavedMinutes should be 0');
  assert.equal(res.body.aggregated.acceptanceRate, 0, 'acceptanceRate should be 0');
  assert.equal(res.body.aggregated.timeSavedHours, '0.0', 'timeSavedHours should be 0.0');
});
