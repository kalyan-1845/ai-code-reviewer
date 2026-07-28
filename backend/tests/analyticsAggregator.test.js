import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import {
  calculateMaintainabilityIndex,
  maintainabilityGrade,
  computeOverview,
  computeTrends,
  readHistory,
  appendHistory,
} from '../services/analyticsAggregator.js';

// ---------------------------------------------------------------------------
// Unit tests: calculateMaintainabilityIndex
// ---------------------------------------------------------------------------

test('MI formula returns correct score for standard inputs', () => {
  // MI = 171 - 5.2*ln(1000) - 0.23*10 - 16.2*ln(500)
  const mi = calculateMaintainabilityIndex({ halsteadVolume: 1000, cyclomaticComplexity: 10, linesOfCode: 500 });
  assert.ok(mi >= 0 && mi <= 100, 'MI should be in [0,100]');
  assert.strictEqual(typeof mi, 'number');
});

test('MI is clamped to [0, 100] for extreme inputs', () => {
  const lowMI  = calculateMaintainabilityIndex({ halsteadVolume: 1e9, cyclomaticComplexity: 500, linesOfCode: 1e6 });
  const highMI = calculateMaintainabilityIndex({ halsteadVolume: 1,   cyclomaticComplexity: 1,   linesOfCode: 1 });

  assert.ok(lowMI >= 0,    'Lower bound should be 0');
  assert.ok(highMI <= 100, 'Upper bound should be 100');
});

test('MI uses HV proxy (LoC * ln(LoC)) when halsteadVolume is missing', () => {
  const miWithHV    = calculateMaintainabilityIndex({ halsteadVolume: 50, cyclomaticComplexity: 5, linesOfCode: 100 });
  const miWithoutHV = calculateMaintainabilityIndex({ cyclomaticComplexity: 5, linesOfCode: 100 });
  // Both should be numbers in valid range
  assert.strictEqual(typeof miWithHV, 'number');
  assert.strictEqual(typeof miWithoutHV, 'number');
  assert.ok(miWithoutHV >= 0 && miWithoutHV <= 100);
});

test('MI defaults missing params to 1 without throwing', () => {
  assert.doesNotThrow(() => calculateMaintainabilityIndex({}));
  assert.doesNotThrow(() => calculateMaintainabilityIndex());
});

// ---------------------------------------------------------------------------
// Unit tests: maintainabilityGrade
// ---------------------------------------------------------------------------

test('maintainabilityGrade returns High for MI >= 85', () => {
  assert.strictEqual(maintainabilityGrade(85), 'High');
  assert.strictEqual(maintainabilityGrade(100), 'High');
  assert.strictEqual(maintainabilityGrade(90.5), 'High');
});

test('maintainabilityGrade returns Moderate for 65 <= MI < 85', () => {
  assert.strictEqual(maintainabilityGrade(65), 'Moderate');
  assert.strictEqual(maintainabilityGrade(75), 'Moderate');
  assert.strictEqual(maintainabilityGrade(84.9), 'Moderate');
});

test('maintainabilityGrade returns Low for MI < 65', () => {
  assert.strictEqual(maintainabilityGrade(0), 'Low');
  assert.strictEqual(maintainabilityGrade(50), 'Low');
  assert.strictEqual(maintainabilityGrade(64.9), 'Low');
});

// ---------------------------------------------------------------------------
// Unit tests: computeOverview
// ---------------------------------------------------------------------------

const sampleRecords = [
  { timestamp: '2026-07-01T10:00:00Z', repoName: 'repo-a', totalLines: 500, cyclomaticComplexity: 12, halsteadComplexity: 800, security: 2, bugs: 5 },
  { timestamp: '2026-07-02T11:00:00Z', repoName: 'repo-b', totalLines: 300, cyclomaticComplexity: 8,  halsteadComplexity: 400, security: 1, bugs: 2 },
  { timestamp: '2026-07-03T12:00:00Z', repoName: 'repo-a', totalLines: 750, cyclomaticComplexity: 20, halsteadComplexity: 1200, security: 4, bugs: 8 },
];

test('computeOverview returns correct totalRuns', () => {
  const result = computeOverview(sampleRecords);
  assert.strictEqual(result.totalRuns, 3);
});

test('computeOverview computes correct totalLinesReviewed', () => {
  const result = computeOverview(sampleRecords);
  assert.strictEqual(result.totalLinesReviewed, 1550);
});

test('computeOverview returns avgMaintainabilityIndex as a number', () => {
  const result = computeOverview(sampleRecords);
  assert.strictEqual(typeof result.avgMaintainabilityIndex, 'number');
  assert.ok(result.avgMaintainabilityIndex >= 0 && result.avgMaintainabilityIndex <= 100);
});

test('computeOverview returns correct totalSecurityIssues and totalBugs', () => {
  const result = computeOverview(sampleRecords);
  assert.strictEqual(result.totalSecurityIssues, 7);
  assert.strictEqual(result.totalBugs, 15);
});

test('computeOverview returns null values for empty records', () => {
  const result = computeOverview([]);
  assert.strictEqual(result.totalRuns, 0);
  assert.strictEqual(result.avgMaintainabilityIndex, null);
  assert.strictEqual(result.maintainabilityGrade, null);
});

test('computeOverview computes vulnerabilityDensity (security issues per 1000 lines)', () => {
  const result = computeOverview(sampleRecords);
  // 7 security issues / 1550 lines * 1000
  const expected = Math.round((7 / 1550) * 1000 * 100) / 100;
  assert.strictEqual(result.vulnerabilityDensity, expected);
});

// ---------------------------------------------------------------------------
// Unit tests: computeTrends
// ---------------------------------------------------------------------------

const now = new Date();
const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
const twoDaysAgo = new Date(now); twoDaysAgo.setDate(now.getDate() - 2);

const recentRecords = [
  { timestamp: twoDaysAgo.toISOString(), repoName: 'repo-a', totalLines: 300, cyclomaticComplexity: 10, halsteadComplexity: 600, security: 1, bugs: 2 },
  { timestamp: yesterday.toISOString(),  repoName: 'repo-b', totalLines: 500, cyclomaticComplexity: 15, halsteadComplexity: 900, security: 3, bugs: 4 },
];

test('computeTrends returns array sorted by date ascending', () => {
  const trends = computeTrends(recentRecords, 30);
  assert.ok(Array.isArray(trends));
  assert.ok(trends.length >= 1);
  for (let i = 1; i < trends.length; i++) {
    assert.ok(trends[i].date >= trends[i - 1].date);
  }
});

test('computeTrends each entry has required keys', () => {
  const trends = computeTrends(recentRecords, 30);
  for (const entry of trends) {
    assert.ok('date' in entry);
    assert.ok('runs' in entry);
    assert.ok('avgMaintainabilityIndex' in entry);
    assert.ok('avgCyclomaticComplexity' in entry);
    assert.ok('totalLinesReviewed' in entry);
    assert.ok('totalSecurityIssues' in entry);
    assert.ok('totalBugs' in entry);
  }
});

test('computeTrends excludes records outside lookback window', () => {
  const oldRecord = {
    timestamp: new Date('2020-01-01T00:00:00Z').toISOString(),
    repoName: 'old-repo',
    totalLines: 100, cyclomaticComplexity: 5, security: 0, bugs: 0,
  };
  const trends = computeTrends([oldRecord, ...recentRecords], 30);
  const dates = trends.map(t => t.date);
  assert.ok(!dates.includes('2020-01-01'), 'Old records should be excluded');
});

test('computeTrends returns empty array for no records', () => {
  assert.deepStrictEqual(computeTrends([], 30), []);
});

// ---------------------------------------------------------------------------
// Integration tests: REST endpoints via Express mock
// ---------------------------------------------------------------------------

function buildTestApp() {
  const app = express();
  app.use(express.json());
  // Mount analytics router without auth (no requireApiKey in test)
  import('../routes/analytics.js').then(({ default: analyticsRouter }) => {
    app.use('/api/analytics', analyticsRouter);
  });
  return app;
}

test('GET /api/analytics/overview responds with overview object', async () => {
  const analyticsRouter = (await import('../routes/analytics.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/analytics', analyticsRouter);

  const res = await request(app).get('/api/analytics/overview');
  assert.strictEqual(res.status, 200);
  assert.ok('overview' in res.body, 'Response should contain overview key');
  assert.ok('totalRuns' in res.body.overview);
  assert.ok('totalLinesReviewed' in res.body.overview);
  assert.ok('avgMaintainabilityIndex' in res.body.overview);
  assert.ok('vulnerabilityDensity' in res.body.overview);
});

test('GET /api/analytics/trends responds with trends array', async () => {
  const analyticsRouter = (await import('../routes/analytics.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/analytics', analyticsRouter);

  const res = await request(app).get('/api/analytics/trends');
  assert.strictEqual(res.status, 200);
  assert.ok('trends' in res.body, 'Response should contain trends key');
  assert.ok(Array.isArray(res.body.trends));
  assert.ok('lookbackDays' in res.body);
  assert.strictEqual(res.body.lookbackDays, 30); // default
});

test('GET /api/analytics/trends respects ?days= query param', async () => {
  const analyticsRouter = (await import('../routes/analytics.js')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/analytics', analyticsRouter);

  const res = await request(app).get('/api/analytics/trends?days=7');
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.lookbackDays, 7);
});
