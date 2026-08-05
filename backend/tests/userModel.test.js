import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Unit tests for the User Mongoose model schema (no live DB connection).
// We verify the schema shape, required fields, defaults, and index definitions
// without opening a real MongoDB socket.
// ---------------------------------------------------------------------------

import mongoose from 'mongoose';

const originalConnect = mongoose.connect;
mongoose.connect = async () => {};

const { default: User } = await import('../models/User.js');

test('User model exports a valid Mongoose model', () => {
  assert.ok(User, 'User model should be exported');
  assert.equal(typeof User, 'function', 'User should be a Mongoose model constructor');
});

test('User schema has clientId field', () => {
  const schemaPaths = User.schema.paths;
  assert.ok(schemaPaths.clientId, 'clientId path should exist on schema');
});

test('User schema requires clientId', () => {
  const schemaPaths = User.schema.paths;
  assert.equal(schemaPaths.clientId.isRequired, true, 'clientId should be required');
});

test('User schema requires clientId to be unique', () => {
  const schemaPaths = User.schema.paths;
  assert.equal(schemaPaths.clientId.options.unique, true, 'clientId should be unique');
});

test('User schema indexes clientId', () => {
  const indexes = User.schema.indexes();
  const clientIdIndex = indexes.find(idx => idx[0].clientId !== undefined);
  assert.ok(clientIdIndex, 'schema should have an index on clientId');
});

test('User schema has preferredModel field with correct default', () => {
  const schemaPaths = User.schema.paths;
  assert.ok(schemaPaths.preferredModel, 'preferredModel path should exist on schema');
  assert.equal(schemaPaths.preferredModel.defaultValue, 'llama-3.3-70b-versatile',
    'preferredModel default should be llama-3.3-70b-versatile');
});

test('User schema has createdAt field', () => {
  const schemaPaths = User.schema.paths;
  assert.ok(schemaPaths.createdAt, 'createdAt path should exist on schema');
});

test('User schema has updatedAt field', () => {
  const schemaPaths = User.schema.paths;
  assert.ok(schemaPaths.updatedAt, 'updatedAt path should exist on schema');
});
