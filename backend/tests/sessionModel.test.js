import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Unit tests for the Session Mongoose model schema (no live DB connection).
// We verify the schema shape, required fields, defaults, and index definitions
// without opening a real MongoDB socket.
// ---------------------------------------------------------------------------

// Stub mongoose so no network calls are made during tests.
import mongoose from 'mongoose';

const originalConnect = mongoose.connect;
mongoose.connect = async () => {};

const { default: Session } = await import('../models/Session.js');

test('Session model is a valid Mongoose model', () => {
  assert.ok(Session, 'Session model should be exported');
  assert.equal(typeof Session, 'function', 'Session should be a Mongoose model constructor');
});

test('Session schema requires sessionId', () => {
  const schemaPaths = Session.schema.paths;
  assert.ok(schemaPaths.sessionId, 'sessionId path should exist on schema');
  assert.equal(schemaPaths.sessionId.isRequired, true, 'sessionId should be required');
});

test('Session schema requires repoUrl', () => {
  const schemaPaths = Session.schema.paths;
  assert.ok(schemaPaths.repoUrl, 'repoUrl path should exist on schema');
  assert.equal(schemaPaths.repoUrl.isRequired, true, 'repoUrl should be required');
});

test('Session schema requires repoName', () => {
  const schemaPaths = Session.schema.paths;
  assert.ok(schemaPaths.repoName, 'repoName path should exist on schema');
  assert.equal(schemaPaths.repoName.isRequired, true, 'repoName should be required');
});

test('Session schema has files array with default empty array', () => {
  const schemaPaths = Session.schema.paths;
  assert.ok(schemaPaths.files, 'files path should exist on schema');
  // Mongoose array paths have an instance of 'Array'
  assert.equal(schemaPaths.files.instance, 'Array', 'files should be an array');
});

test('Session schema has createdAt Date field', () => {
  const schemaPaths = Session.schema.paths;
  assert.ok(schemaPaths.createdAt, 'createdAt path should exist on schema');
  assert.equal(schemaPaths.createdAt.instance, 'Date', 'createdAt should be a Date');
});

test('Session schema has TTL index on lastAccessedAt with 24-hour expiry', () => {
  const indexes = Session.schema.indexes();
  const ttlIndex = indexes.find(([fields, opts]) => fields.lastAccessedAt === 1 && opts.expireAfterSeconds !== undefined);
  assert.ok(ttlIndex, 'TTL index on lastAccessedAt should be defined');
  assert.equal(ttlIndex[1].expireAfterSeconds, 86400, 'TTL should be 86400 seconds (24 hours)');
});

test('Session schema has TTL index on absoluteExpiry with 0-second expiry', () => {
  const indexes = Session.schema.indexes();
  const absIndex = indexes.find(([fields, opts]) => fields.absoluteExpiry === 1 && opts.expireAfterSeconds !== undefined);
  assert.ok(absIndex, 'TTL index on absoluteExpiry should be defined');
  assert.equal(absIndex[1].expireAfterSeconds, 0, 'TTL should be 0 seconds (exact expiry)');
});

test('Session schema has unique index on sessionId', () => {
  const schemaPaths = Session.schema.paths;
  assert.equal(schemaPaths.sessionId.options.unique, true, 'sessionId should have a unique index');
});

// Restore mongoose after tests
mongoose.connect = originalConnect;
