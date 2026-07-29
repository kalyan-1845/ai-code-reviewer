import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Unit tests for the RoiMetrics mongoose model schema (no live DB connection).
// We verify the schema shape, required fields, defaults, indexes, and static
// methods without opening a real MongoDB socket.
// ---------------------------------------------------------------------------

// Stub mongoose so no network calls are made during tests.
import mongoose from 'mongoose';

const originalConnect = mongoose.connect;
mongoose.connect = async () => {};

const { RoiMetrics } = await import('../models/RoiMetrics.js');

test('RoiMetrics model is a valid Mongoose model', () => {
  assert.ok(RoiMetrics, 'RoiMetrics model should be exported');
  assert.equal(typeof RoiMetrics, 'function', 'RoiMetrics should be a Mongoose model constructor');
});

test('RoiMetrics schema requires repoName', () => {
  const schemaPaths = RoiMetrics.schema.paths;
  assert.ok(schemaPaths.repoName, 'repoName path should exist on schema');
  assert.equal(schemaPaths.repoName.isRequired, true, 'repoName should be required');
});

test('RoiMetrics schema has index on repoName', () => {
  const indexes = RoiMetrics.schema.indexes();
  const repoIndex = indexes.find(([fields]) => fields.repoName === 1);
  assert.ok(repoIndex, 'index on repoName should be defined');
});

test('RoiMetrics schema has totalPrsReviewed with default 0', () => {
  const schemaPaths = RoiMetrics.schema.paths;
  assert.ok(schemaPaths.totalPrsReviewed, 'totalPrsReviewed path should exist');
  assert.equal(schemaPaths.totalPrsReviewed.defaultValue, 0, 'totalPrsReviewed default should be 0');
});

test('RoiMetrics schema has totalAiComments with default 0', () => {
  const schemaPaths = RoiMetrics.schema.paths;
  assert.ok(schemaPaths.totalAiComments, 'totalAiComments path should exist');
  assert.equal(schemaPaths.totalAiComments.defaultValue, 0, 'totalAiComments default should be 0');
});

test('RoiMetrics schema has acceptedSuggestions with default 0', () => {
  const schemaPaths = RoiMetrics.schema.paths;
  assert.ok(schemaPaths.acceptedSuggestions, 'acceptedSuggestions path should exist');
  assert.equal(schemaPaths.acceptedSuggestions.defaultValue, 0, 'acceptedSuggestions default should be 0');
});

test('RoiMetrics schema has timeSavedMinutes with default 0', () => {
  const schemaPaths = RoiMetrics.schema.paths;
  assert.ok(schemaPaths.timeSavedMinutes, 'timeSavedMinutes path should exist');
  assert.equal(schemaPaths.timeSavedMinutes.defaultValue, 0, 'timeSavedMinutes default should be 0');
});

test('RoiMetrics schema uses timestamps', () => {
  const schemaPaths = RoiMetrics.schema.paths;
  assert.ok(schemaPaths.createdAt, 'createdAt should be defined via timestamps');
  assert.ok(schemaPaths.updatedAt, 'updatedAt should be defined via timestamps');
});

test('RoiMetrics has recordPrReview static method', () => {
  assert.equal(typeof RoiMetrics.recordPrReview, 'function', 'recordPrReview should be a static method');
});

test('RoiMetrics has recordAcceptedSuggestion static method', () => {
  assert.equal(typeof RoiMetrics.recordAcceptedSuggestion, 'function', 'recordAcceptedSuggestion should be a static method');
});

test('RoiMetrics recordPrReview calls findOneAndUpdate with correct arguments', async () => {
  let capturedQuery = null;
  let capturedUpdate = null;
  const originalFindOneAndUpdate = RoiMetrics.findOneAndUpdate;
  RoiMetrics.findOneAndUpdate = async (query, update, options) => {
    capturedQuery = query;
    capturedUpdate = update;
    return { repoName: 'test/repo', totalPrsReviewed: 1, totalAiComments: 3 };
  };

  const result = await RoiMetrics.recordPrReview('test/repo', 3);

  assert.deepEqual(capturedQuery, { repoName: 'test/repo' }, 'query should filter by repoName');
  assert.equal(capturedUpdate.$inc.totalPrsReviewed, 1, 'should increment totalPrsReviewed by 1');
  assert.equal(capturedUpdate.$inc.totalAiComments, 3, 'should increment totalAiComments by given count');
  assert.equal(result.totalPrsReviewed, 1, 'result should reflect the updated values');

  RoiMetrics.findOneAndUpdate = originalFindOneAndUpdate;
});

test('RoiMetrics recordAcceptedSuggestion calls findOneAndUpdate with correct arguments', async () => {
  let capturedQuery = null;
  let capturedUpdate = null;
  const originalFindOneAndUpdate = RoiMetrics.findOneAndUpdate;
  RoiMetrics.findOneAndUpdate = async (query, update, options) => {
    capturedQuery = query;
    capturedUpdate = update;
    return { repoName: 'test/repo', acceptedSuggestions: 1, timeSavedMinutes: 15 };
  };

  const result = await RoiMetrics.recordAcceptedSuggestion('test/repo');

  assert.deepEqual(capturedQuery, { repoName: 'test/repo' }, 'query should filter by repoName');
  assert.equal(capturedUpdate.$inc.acceptedSuggestions, 1, 'should increment acceptedSuggestions by 1');
  assert.equal(capturedUpdate.$inc.timeSavedMinutes, 15, 'should increment timeSavedMinutes by 15 (15min per suggestion)');
  assert.equal(result.acceptedSuggestions, 1, 'result should reflect the updated values');

  RoiMetrics.findOneAndUpdate = originalFindOneAndUpdate;
});

// Restore original connect
mongoose.connect = originalConnect;
