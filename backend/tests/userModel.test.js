import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

// ---------------------------------------------------------------------------
// Intercept mongoose.model before User is imported.
// ---------------------------------------------------------------------------
const originalModel = mongoose.model.bind(mongoose);

mongoose.model = (name, schema) => {
  if (name === 'User') {
    const realSchema = schema;

    const TestUser = function (data) {
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
    };

    TestUser.create = async (doc) => new TestUser(doc);
    TestUser.schema = realSchema;
    return TestUser;
  }
  return originalModel(name, schema);
};

const { default: User } = await import('../models/User.js');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
test('User model is exported and callable', () => {
  assert.ok(typeof User === 'function', 'User should be a constructor function');
});

test('User.create is available as a static method', () => {
  assert.ok(typeof User.create === 'function', 'User.create should be a function');
});

test('User instances accept clientId and preferredModel', () => {
  const user = new User({
    clientId: 'client-123',
    preferredModel: 'gpt-4',
  });
  assert.equal(user.clientId, 'client-123');
  assert.equal(user.preferredModel, 'gpt-4');
});

test('User preferredModel defaults to llama-3.3-70b-versatile', () => {
  const user = new User({
    clientId: 'client-456',
  });
  assert.equal(user.preferredModel, 'llama-3.3-70b-versatile');
});

test('User instances have createdAt field', () => {
  const user = new User({
    clientId: 'client-789',
  });
  assert.ok('createdAt' in user, 'User instance should have createdAt field');
});

test('User instances have updatedAt field', () => {
  const user = new User({
    clientId: 'client-abc',
  });
  assert.ok('updatedAt' in user, 'User instance should have updatedAt field');
});

test('User schema has required clientId field', () => {
  const schemaPaths = User.schema.paths;
  assert.ok(schemaPaths.clientId, 'clientId path should exist in schema');
  assert.equal(schemaPaths.clientId.isRequired, true, 'clientId should be required');
});

test('User schema clientId has unique constraint', () => {
  const schemaPaths = User.schema.paths;
  assert.equal(schemaPaths.clientId.options.unique, true, 'clientId should be unique');
});

test('User schema clientId has index', () => {
  const schemaPaths = User.schema.paths;
  assert.equal(schemaPaths.clientId.options.index, true, 'clientId should be indexed');
});

test('User schema has preferredModel field', () => {
  const schemaPaths = User.schema.paths;
  assert.ok(schemaPaths.preferredModel, 'preferredModel path should exist in schema');
});
