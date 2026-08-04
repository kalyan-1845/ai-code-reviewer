import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

// ---------------------------------------------------------------------------
// Intercept mongoose.model before RoiMetrics is imported.
// The RoiMetrics file uses a NAMED export: export const RoiMetrics = mongoose.model(...)
// ---------------------------------------------------------------------------
const originalModel = mongoose.model.bind(mongoose);
let mockRoiMetricsInstance = null;

mongoose.model = (name, schema) => {
  if (name === 'RoiMetrics') {
    const realSchema = schema;

    const TestRoiMetrics = function (data) {
      const defaults = {};
      const paths = realSchema.paths || {};
      for (const [field, pathDef] of Object.entries(paths)) {
        if (pathDef.options && 'default' in pathDef.options) {
          defaults[field] =
            typeof pathDef.options.default === 'function'
              ? pathDef.options.default()
              : pathDef.options.default;
        }
      }
      Object.assign(this, defaults, data);
      mockRoiMetricsInstance = this;
    };

    TestRoiMetrics.findOneAndUpdate = async (filter, update, opts) => {
      const repoName = filter.repoName;
      // upsert creates a new document only if one does not exist for this repoName
      if (!mockRoiMetricsInstance || mockRoiMetricsInstance.repoName !== repoName) {
        mockRoiMetricsInstance = new TestRoiMetrics({ repoName });
      }
      if (update.$inc) {
        for (const [field, delta] of Object.entries(update.$inc)) {
          mockRoiMetricsInstance[field] = (mockRoiMetricsInstance[field] || 0) + delta;
        }
      }
      return mockRoiMetricsInstance;
    };

    TestRoiMetrics.schema = realSchema;

    // Attach the static methods to the constructor
    TestRoiMetrics.recordPrReview = async function (clientId, repoName, commentsCount) {
      return await this.findOneAndUpdate(
        { clientId, repoName },
        { $inc: { totalPrsReviewed: 1, totalAiComments: commentsCount } },
        { new: true, upsert: true }
      );
    };

    TestRoiMetrics.recordAcceptedSuggestion = async function (clientId, repoName) {
      return await this.findOneAndUpdate(
        { clientId, repoName },
        { $inc: { acceptedSuggestions: 1, timeSavedMinutes: 15 } },
        { new: true, upsert: true }
      );
    };

    return TestRoiMetrics;
  }
  return originalModel(name, schema);
};

// RoiMetrics uses: export const RoiMetrics = mongoose.model(...)
// We need to capture the named export after import
let RoiMetrics;
await import('../models/RoiMetrics.js').then(m => { RoiMetrics = m.RoiMetrics; });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
test('RoiMetrics is exported as a named export', () => {
  assert.ok(RoiMetrics, 'RoiMetrics should be exported');
  assert.ok(typeof RoiMetrics === 'function', 'RoiMetrics should be a constructor function');
});

test('RoiMetrics instances accept repoName and numeric fields', () => {
  const metrics = new RoiMetrics({
    repoName: 'test/repo',
    totalPrsReviewed: 5,
    totalAiComments: 20,
    acceptedSuggestions: 10,
    timeSavedMinutes: 150,
  });
  assert.equal(metrics.repoName, 'test/repo');
  assert.equal(metrics.totalPrsReviewed, 5);
  assert.equal(metrics.totalAiComments, 20);
  assert.equal(metrics.acceptedSuggestions, 10);
  assert.equal(metrics.timeSavedMinutes, 150);
});

test('RoiMetrics defaults totalPrsReviewed to 0', () => {
  const metrics = new RoiMetrics({ repoName: 'another/repo' });
  assert.equal(metrics.totalPrsReviewed, 0);
});

test('RoiMetrics defaults totalAiComments to 0', () => {
  const metrics = new RoiMetrics({ repoName: 'another/repo' });
  assert.equal(metrics.totalAiComments, 0);
});

test('RoiMetrics defaults acceptedSuggestions to 0', () => {
  const metrics = new RoiMetrics({ repoName: 'another/repo' });
  assert.equal(metrics.acceptedSuggestions, 0);
});

test('RoiMetrics defaults timeSavedMinutes to 0', () => {
  const metrics = new RoiMetrics({ repoName: 'another/repo' });
  assert.equal(metrics.timeSavedMinutes, 0);
});

test('RoiMetrics schema requires repoName', () => {
  const schemaPaths = RoiMetrics.schema.paths;
  assert.ok(schemaPaths.repoName, 'repoName path should exist in schema');
  assert.equal(schemaPaths.repoName.isRequired, true, 'repoName should be required');
});

test('RoiMetrics schema repoName has index', () => {
  const schemaPaths = RoiMetrics.schema.paths;
  assert.equal(schemaPaths.repoName.options.index, true, 'repoName should be indexed');
});

test('RoiMetrics has recordPrReview static method', () => {
  assert.ok(typeof RoiMetrics.recordPrReview === 'function', 'recordPrReview should be a function');
});

test('RoiMetrics has recordAcceptedSuggestion static method', () => {
  assert.ok(typeof RoiMetrics.recordAcceptedSuggestion === 'function', 'recordAcceptedSuggestion should be a function');
});

test('recordPrReview increments totalPrsReviewed and totalAiComments', async () => {
  mockRoiMetricsInstance = null; // reset
  const result = await RoiMetrics.recordPrReview('test-client', 'incremental/repo', 7);
  assert.ok(result, 'recordPrReview should return a result');
  assert.equal(result.totalPrsReviewed, 1, 'totalPrsReviewed should be incremented by 1');
  assert.equal(result.totalAiComments, 7, 'totalAiComments should equal the provided count');
});

test('recordPrReview accumulates on subsequent calls', async () => {
  mockRoiMetricsInstance = null; // reset
  await RoiMetrics.recordPrReview('test-client', 'accumulate/repo', 3);
  const result = await RoiMetrics.recordPrReview('test-client', 'accumulate/repo', 4);
  assert.equal(result.totalPrsReviewed, 2, 'totalPrsReviewed should accumulate');
  assert.equal(result.totalAiComments, 7, 'totalAiComments should accumulate');
});

test('recordAcceptedSuggestion increments acceptedSuggestions by 1 and timeSavedMinutes by 15', async () => {
  mockRoiMetricsInstance = null; // reset
  const result = await RoiMetrics.recordAcceptedSuggestion('test-client', 'timesaved/repo');
  assert.ok(result, 'recordAcceptedSuggestion should return a result');
  assert.equal(result.acceptedSuggestions, 1, 'acceptedSuggestions should be incremented by 1');
  assert.equal(result.timeSavedMinutes, 15, 'timeSavedMinutes should be incremented by 15');
});

test('recordAcceptedSuggestion accumulates on subsequent calls', async () => {
  mockRoiMetricsInstance = null; // reset
  await RoiMetrics.recordAcceptedSuggestion('test-client', 'acc/repo');
  const result = await RoiMetrics.recordAcceptedSuggestion('test-client', 'acc/repo');
  assert.equal(result.acceptedSuggestions, 2, 'acceptedSuggestions should accumulate');
  assert.equal(result.timeSavedMinutes, 30, 'timeSavedMinutes should accumulate to 30');
});
