import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Unit tests for GET and POST /api/user/settings endpoints (backend/index.js).
// Tests cover: model lookup, default model fallback, model validation,
// and upsert behavior. Does not require a live MongoDB connection.
// ---------------------------------------------------------------------------

// Stub mongoose so no network calls are made during tests.
import mongoose from 'mongoose';
const originalConnect = mongoose.connect;
mongoose.connect = async () => {};

process.env.REPOSAGE_API_KEY = 'test-api-key-123';

const { default: User } = await import('../models/User.js');

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
    headers: { 'x-api-key': 'test-api-key-123' },
    clientId: 'test-client-id',
    body: {},
    ...overrides,
  };
  return { req, res };
}

// Inline the GET handler for testing (mirrors backend/index.js lines 693-700)
async function getUserSettingsHandler(req, res) {
  try {
    const user = await User.findOne({ clientId: req.clientId });
    res.status(200).json({ preferredModel: user?.preferredModel || 'llama-3.3-70b-versatile' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
}

// Inline the POST handler for testing (mirrors backend/index.js lines 702-719)
const ALLOWED_ANALYSIS_MODELS = ["llama-3.3-70b-versatile", "deepseek-r1-distill-llama-70b", "llama-3.1-8b-instant", "gemma2-9b-it", "gpt-3.5-turbo", "gemini-3.1-pro"];

async function postUserSettingsHandler(req, res) {
  const { preferredModel } = req.body;
  if (!ALLOWED_ANALYSIS_MODELS.includes(preferredModel)) {
    return res.status(400).json({ error: 'Invalid model selection' });
  }
  try {
    const user = await User.findOneAndUpdate(
      { clientId: req.clientId },
      { preferredModel },
      { upsert: true, new: true }
    );
    res.status(200).json({ success: true, preferredModel: user.preferredModel });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
}

// --- GET /api/user/settings tests ---

test('GET /api/user/settings returns 200 with default model when no user exists', async () => {
  const { req, res } = makeReqRes();
  const originalFindOne = User.findOne;
  User.findOne = async (query) => {
    assert.equal(query.clientId, 'test-client-id', 'should query by clientId');
    return null;
  };

  await getUserSettingsHandler(req, res);

  assert.equal(res.statusCode, 200, 'should return 200');
  assert.equal(res.body.preferredModel, 'llama-3.3-70b-versatile', 'should return default model');

  User.findOne = originalFindOne;
});

test('GET /api/user/settings returns 200 with stored model when user exists', async () => {
  const { req, res } = makeReqRes();
  const originalFindOne = User.findOne;
  User.findOne = async (query) => {
    assert.equal(query.clientId, 'test-client-id', 'should query by clientId');
    return { clientId: 'test-client-id', preferredModel: 'deepseek-r1-distill-llama-70b' };
  };

  await getUserSettingsHandler(req, res);

  assert.equal(res.statusCode, 200, 'should return 200');
  assert.equal(res.body.preferredModel, 'deepseek-r1-distill-llama-70b', 'should return stored model');

  User.findOne = originalFindOne;
});

test('GET /api/user/settings returns 500 on database error', async () => {
  const { req, res } = makeReqRes();
  const originalFindOne = User.findOne;
  User.findOne = async () => { throw new Error('DB connection failed'); };

  await getUserSettingsHandler(req, res);

  assert.equal(res.statusCode, 500, 'should return 500 on error');
  assert.ok(res.body.error.includes('Failed to fetch'), 'should return error message');

  User.findOne = originalFindOne;
});

// --- POST /api/user/settings tests ---

test('POST /api/user/settings returns 200 with valid model', async () => {
  const { req, res } = makeReqRes({ body: { preferredModel: 'gpt-3.5-turbo' } });
  const originalFindOneAndUpdate = User.findOneAndUpdate;
  User.findOneAndUpdate = async (query, update, options) => {
    assert.equal(query.clientId, 'test-client-id', 'should query by clientId');
    assert.equal(update.preferredModel, 'gpt-3.5-turbo', 'should update preferredModel');
    assert.equal(options.new, true, 'should return new document');
    assert.equal(options.upsert, true, 'should upsert');
    return { clientId: 'test-client-id', preferredModel: 'gpt-3.5-turbo' };
  };

  await postUserSettingsHandler(req, res);

  assert.equal(res.statusCode, 200, 'should return 200');
  assert.equal(res.body.success, true, 'should return success');
  assert.equal(res.body.preferredModel, 'gpt-3.5-turbo', 'should return updated model');

  User.findOneAndUpdate = originalFindOneAndUpdate;
});

test('POST /api/user/settings returns 400 with invalid model', async () => {
  const { req, res } = makeReqRes({ body: { preferredModel: 'invalid-model-name' } });

  await postUserSettingsHandler(req, res);

  assert.equal(res.statusCode, 400, 'should return 400 for invalid model');
  assert.ok(res.body.error.includes('Invalid model'), 'should return error message');
});

test('POST /api/user/settings returns 400 when preferredModel is missing', async () => {
  const { req, res } = makeReqRes({ body: {} });

  await postUserSettingsHandler(req, res);

  assert.equal(res.statusCode, 400, 'should return 400 when preferredModel is missing');
  assert.ok(res.body.error.includes('Invalid model'), 'should return error for undefined model');
});

test('POST /api/user/settings returns 500 on database error', async () => {
  const { req, res } = makeReqRes({ body: { preferredModel: 'llama-3.3-70b-versatile' } });
  const originalFindOneAndUpdate = User.findOneAndUpdate;
  User.findOneAndUpdate = async () => { throw new Error('DB write failed'); };

  await postUserSettingsHandler(req, res);

  assert.equal(res.statusCode, 500, 'should return 500 on error');
  assert.ok(res.body.error.includes('Failed to update'), 'should return error message');

  User.findOneAndUpdate = originalFindOneAndUpdate;
});

// Restore mongoose after tests
mongoose.connect = originalConnect;
