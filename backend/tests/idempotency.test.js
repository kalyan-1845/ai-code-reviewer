import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { generateIdempotencyKey, createIdempotencyMiddleware } from '../middleware/idempotency.js';
import DedupStore from '../utils/dedupStore.js';

test('generateIdempotencyKey creates deterministic SHA256 keys', () => {
  const req1 = {
    body: {
      repoUrl: 'https://github.com/owner/repo',
      commitSha: 'abc123456789',
      prNumber: 42,
    },
    headers: {},
  };

  const req2 = {
    body: {
      repository: { html_url: 'https://github.com/owner/repo' },
      head_commit: { id: 'abc123456789' },
      pull_request: { number: '42' },
    },
    headers: {},
  };

  const key1 = generateIdempotencyKey(req1);
  const key2 = generateIdempotencyKey(req2);

  assert.ok(key1.startsWith('idempotency:'));
  assert.strictEqual(key1, key2, 'Composite keys for identical repo/sha/pr should match');
});

test('generateIdempotencyKey respects custom x-idempotency-key header', () => {
  const req = {
    body: { repoUrl: 'https://github.com/owner/repo' },
    headers: { 'x-idempotency-key': 'unique-client-key-123' },
  };

  const key = generateIdempotencyKey(req);
  assert.ok(key.startsWith('idempotency:custom:'));
});

test('idempotencyMiddleware intercepts duplicate concurrent PROCESSING requests', async () => {
  const store = new DedupStore();
  const idempotency = createIdempotencyMiddleware({ store, processingTtlMs: 10000 });

  const app = express();
  app.use(express.json());

  let delayedHandlerResolve;
  const delayedPromise = new Promise((resolve) => {
    delayedHandlerResolve = resolve;
  });

  app.post('/api/analyze', idempotency, async (req, res) => {
    await delayedPromise;
    res.json({ success: true, result: 'analyzed' });
  });

  // First request — held in flight
  const req1 = request(app)
    .post('/api/analyze')
    .send({ repoUrl: 'https://github.com/test/repo', commitSha: 'sha1', prNumber: 10 });

  // Brief delay to ensure req1 claims the lock
  await new Promise((r) => setTimeout(r, 50));

  // Second duplicate request — sent while first is still PROCESSING
  const res2 = await request(app)
    .post('/api/analyze')
    .send({ repoUrl: 'https://github.com/test/repo', commitSha: 'sha1', prNumber: 10 });

  assert.strictEqual(res2.status, 202);
  assert.strictEqual(res2.body.status, 'PROCESSING');
  assert.strictEqual(res2.body.message, 'Job already in execution pipeline');
  assert.ok(res2.body.jobId, 'Response should contain a jobId');

  // Complete first request
  delayedHandlerResolve();
  const res1 = await req1;
  assert.strictEqual(res1.status, 200);
  assert.strictEqual(res1.body.success, true);
  store.stopSweeper();
});

test('idempotencyMiddleware returns cached result when COMPLETED', async () => {
  const store = new DedupStore();
  const idempotency = createIdempotencyMiddleware({ store, completedTtlMs: 10000 });

  const app = express();
  app.use(express.json());

  let callCount = 0;
  app.post('/api/analyze', idempotency, (req, res) => {
    callCount++;
    res.json({ success: true, callCount });
  });

  const payload = { repoUrl: 'https://github.com/test/cache-repo', commitSha: 'sha2', prNumber: 20 };

  const res1 = await request(app).post('/api/analyze').send(payload);
  assert.strictEqual(res1.status, 200);
  assert.strictEqual(res1.body.callCount, 1);

  // Subsequent request for same key
  const res2 = await request(app).post('/api/analyze').send(payload);
  assert.strictEqual(res2.status, 200);
  assert.strictEqual(res2.body.callCount, 1, 'Handler should not be called again');

  store.stopSweeper();
});

test('idempotencyMiddleware releases lock on error so retries can proceed', async () => {
  const store = new DedupStore();
  const idempotency = createIdempotencyMiddleware({ store });

  const app = express();
  app.use(express.json());

  let shouldFail = true;
  app.post('/api/analyze', idempotency, (req, res) => {
    if (shouldFail) {
      return res.status(500).json({ error: 'Internal failure' });
    }
    return res.json({ success: true });
  });

  const payload = { repoUrl: 'https://github.com/test/error-repo', commitSha: 'sha3', prNumber: 30 };

  const res1 = await request(app).post('/api/analyze').send(payload);
  assert.strictEqual(res1.status, 500);

  // Retry after failure — should be allowed because error released the lock
  shouldFail = false;
  const res2 = await request(app).post('/api/analyze').send(payload);
  assert.strictEqual(res2.status, 200);
  assert.strictEqual(res2.body.success, true);

  store.stopSweeper();
});

test('idempotencyMiddleware bypasses GET requests', async () => {
  const store = new DedupStore();
  const idempotency = createIdempotencyMiddleware({ store });

  const app = express();
  app.get('/api/status', idempotency, (req, res) => {
    res.json({ status: 'ok' });
  });

  const res1 = await request(app).get('/api/status');
  assert.strictEqual(res1.status, 200);
  assert.strictEqual(res1.body.status, 'ok');

  store.stopSweeper();
});
