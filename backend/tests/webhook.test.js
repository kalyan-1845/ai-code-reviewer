import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Webhook endpoint tests.
//
// These tests use a minimal Express app that replicates the webhook route
// logic from backend/index.js without importing the full application (which
// has side effects: database connection, Redis, etc.).
//
// The webhook route in index.js uses module-level state:
//   processedDeliveries (Map)  — per-process deduplication of GitHub delivery IDs
//   reviewedShas      (Map)  — per-process deduplication of commit SHAs
//   reviewQueue       — instance of ReviewQueue
//
// Since each test file runs in a fresh process, the Map state starts empty.
// ---------------------------------------------------------------------------

import ReviewQueue from '../utils/reviewQueue.js';
import { verifyWebhookSignature } from '../utils/signatureVerifier.js';

// ---------------------------------------------------------------------------
// Helper: build a minimal webhook handler mirroring backend/index.js logic.
// ---------------------------------------------------------------------------
function buildWebhookApp() {
  // We use the real ReviewQueue so the per-key mutex is exercised.
  const reviewQueue = new ReviewQueue();
  // processedDeliveries and reviewedShas are per-process Maps as in index.js.
  const processedDeliveries = new Map();
  const reviewedShas = new Map();

  // Track enqueue calls for assertions.
  const enqueueCalls = [];
  const originalEnqueue = reviewQueue.enqueue.bind(reviewQueue);
  reviewQueue.enqueue = function (key, item, processor) {
    enqueueCalls.push({ key, item });
    return originalEnqueue(key, item, processor);
  };

  // Returns an Express-like middleware that handles a POST /api/webhook request.
  async function webhookHandler(req) {
    const webhookSecret = process.env.WEBHOOK_SECRET;
    if (!webhookSecret) {
      return { status: 500, body: { error: 'Webhook secret not configured.' } };
    }

    const signature = req.headers['x-hub-signature-256'];
    if (!signature) {
      return { status: 401, body: { error: 'Missing X-Hub-Signature-256 header.' } };
    }

    if (!verifyWebhookSignature(req.rawBody, signature, webhookSecret)) {
      return { status: 401, body: { error: 'Invalid webhook signature' } };
    }

    const event = req.headers['x-github-event'];
    const payload = req.body;

    if (event === 'pull_request') {
      const deliveryId = req.headers['x-github-delivery'];
      if (deliveryId) {
        if (processedDeliveries.has(deliveryId)) {
          return { status: 200, body: { success: true, message: 'Webhook received (duplicate skipped).' } };
        }
        processedDeliveries.set(deliveryId, Date.now());
      }

      const action = payload.action;
      if (action === 'opened' || action === 'synchronize') {
        const pullNumber = payload.pull_request.number;
        const headSha = payload.pull_request.head.sha;
        const owner = payload.repository.owner.login;
        const repo = payload.repository.name;
        const reviewKey = `${owner}/${repo}/#${pullNumber}`;

        const shaKey = `${owner}/${repo}/#${pullNumber}`;
        if (!reviewedShas.has(shaKey)) {
          reviewedShas.set(shaKey, new Set());
        }
        if (reviewedShas.get(shaKey).has(headSha)) {
          return { status: 200, body: { success: true, message: 'Webhook received (duplicate SHA skipped).' } };
        }
        reviewedShas.get(shaKey).add(headSha);

        await reviewQueue.enqueue(reviewKey, { owner, repo, pullNumber, headSha }, async () => {});
      }
    }

    return { status: 200, body: { success: true, message: 'Webhook received.' } };
  }

  return { webhookHandler, reviewQueue, enqueueCalls, processedDeliveries, reviewedShas };
}

function makeSignature(rawBody, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  return `sha256=${hmac.update(rawBody).digest('hex')}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('missing X-Hub-Signature-256 header returns 401', async () => {
  process.env.WEBHOOK_SECRET = 'test_secret';
  const { webhookHandler } = buildWebhookApp();

  const result = await webhookHandler({
    headers: { 'x-github-event': 'push' },
    body: { action: 'opened' },
    rawBody: '{}',
  });

  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'Missing X-Hub-Signature-256 header.');
});

test('invalid signature returns 401', async () => {
  process.env.WEBHOOK_SECRET = 'test_secret';
  const { webhookHandler } = buildWebhookApp();

  const result = await webhookHandler({
    headers: {
      'x-github-event': 'push',
      'x-hub-signature-256': 'sha256=invalidhash',
    },
    body: { action: 'opened' },
    rawBody: '{}',
  });

  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'Invalid webhook signature');
});

test('WEBHOOK_SECRET not configured returns 500', async () => {
  delete process.env.WEBHOOK_SECRET;
  const { webhookHandler } = buildWebhookApp();

  const result = await webhookHandler({
    headers: {
      'x-github-event': 'push',
      'x-hub-signature-256': 'sha256=anything',
    },
    body: {},
    rawBody: '{}',
  });

  assert.equal(result.status, 500);
  assert.ok(result.body.error.includes('not configured'));
});

test('ping event returns 200 without queuing review', async () => {
  process.env.WEBHOOK_SECRET = 'test_secret';
  const { webhookHandler, enqueueCalls } = buildWebhookApp();
  const rawBody = JSON.stringify({});
  const signature = makeSignature(rawBody, 'test_secret');

  const result = await webhookHandler({
    headers: {
      'x-github-event': 'ping',
      'x-hub-signature-256': signature,
    },
    body: {},
    rawBody,
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(enqueueCalls.length, 0, 'ping should not trigger a review enqueue');
});

test('pull_request opened action queues review via reviewQueue.enqueue', async () => {
  process.env.WEBHOOK_SECRET = 'test_secret';
  const { webhookHandler, enqueueCalls } = buildWebhookApp();
  const payload = {
    action: 'opened',
    pull_request: { number: 42, head: { sha: 'abc123def456' } },
    repository: { owner: { login: 'myorg' }, name: 'myrepo' },
  };
  const rawBody = JSON.stringify(payload);
  const signature = makeSignature(rawBody, 'test_secret');

  const result = await webhookHandler({
    headers: {
      'x-github-event': 'pull_request',
      'x-hub-signature-256': signature,
    },
    body: payload,
    rawBody,
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(enqueueCalls.length, 1);
  assert.equal(enqueueCalls[0].key, 'myorg/myrepo/#42');
  assert.deepEqual(enqueueCalls[0].item, {
    owner: 'myorg',
    repo: 'myrepo',
    pullNumber: 42,
    headSha: 'abc123def456',
  });
});

test('pull_request synchronize action queues review', async () => {
  process.env.WEBHOOK_SECRET = 'test_secret';
  const { webhookHandler, enqueueCalls } = buildWebhookApp();
  const payload = {
    action: 'synchronize',
    pull_request: { number: 99, head: { sha: 'newcommitsha' } },
    repository: { owner: { login: 'owner' }, name: 'repo' },
  };
  const rawBody = JSON.stringify(payload);
  const signature = makeSignature(rawBody, 'test_secret');

  const result = await webhookHandler({
    headers: {
      'x-github-event': 'pull_request',
      'x-hub-signature-256': signature,
    },
    body: payload,
    rawBody,
  });

  assert.equal(result.status, 200);
  assert.equal(enqueueCalls.length, 1);
  assert.equal(enqueueCalls[0].item.pullNumber, 99);
});

test('duplicate delivery ID is skipped (deduplication)', async () => {
  process.env.WEBHOOK_SECRET = 'test_secret';
  const { webhookHandler, enqueueCalls, processedDeliveries } = buildWebhookApp();

  const deliveryId = 'dedup-test-delivery-id-' + Date.now();
  processedDeliveries.set(deliveryId, Date.now()); // pre-populate

  const payload = {
    action: 'opened',
    pull_request: { number: 5, head: { sha: 'sha111' } },
    repository: { owner: { login: 'org' }, name: 'r' },
  };
  const rawBody = JSON.stringify(payload);
  const signature = makeSignature(rawBody, 'test_secret');

  const result = await webhookHandler({
    headers: {
      'x-github-event': 'pull_request',
      'x-github-delivery': deliveryId,
      'x-hub-signature-256': signature,
    },
    body: payload,
    rawBody,
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.message, 'Webhook received (duplicate skipped).');
  assert.equal(enqueueCalls.length, 0, 'duplicate delivery should not enqueue');
});

test('duplicate SHA within same PR is skipped', async () => {
  process.env.WEBHOOK_SECRET = 'test_secret';
  const { webhookHandler, enqueueCalls, reviewedShas } = buildWebhookApp();

  // Pre-populate with the SHA we will send
  reviewedShas.set('owner/repo/#10', new Set(['shausera']));

  const payload = {
    action: 'opened',
    pull_request: { number: 10, head: { sha: 'shausera' } },
    repository: { owner: { login: 'owner' }, name: 'repo' },
  };
  const rawBody = JSON.stringify(payload);
  const signature = makeSignature(rawBody, 'test_secret');

  const result = await webhookHandler({
    headers: {
      'x-github-event': 'pull_request',
      'x-hub-signature-256': signature,
    },
    body: payload,
    rawBody,
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.message, 'Webhook received (duplicate SHA skipped).');
  assert.equal(enqueueCalls.length, 0, 'duplicate SHA should not enqueue');
});

test('closed pull_request action returns success without queuing', async () => {
  process.env.WEBHOOK_SECRET = 'test_secret';
  const { webhookHandler, enqueueCalls } = buildWebhookApp();
  const payload = {
    action: 'closed',
    pull_request: { number: 7, head: { sha: 'sha789' } },
    repository: { owner: { login: 'o' }, name: 'r' },
  };
  const rawBody = JSON.stringify(payload);
  const signature = makeSignature(rawBody, 'test_secret');

  const result = await webhookHandler({
    headers: {
      'x-github-event': 'pull_request',
      'x-hub-signature-256': signature,
    },
    body: payload,
    rawBody,
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(enqueueCalls.length, 0, 'closed action should not enqueue');
});

test('non-pull_request event (push) returns success without queuing', async () => {
  process.env.WEBHOOK_SECRET = 'test_secret';
  const { webhookHandler, enqueueCalls } = buildWebhookApp();
  const payload = { ref: 'refs/heads/main', commits: [] };
  const rawBody = JSON.stringify(payload);
  const signature = makeSignature(rawBody, 'test_secret');

  const result = await webhookHandler({
    headers: {
      'x-github-event': 'push',
      'x-hub-signature-256': signature,
    },
    body: payload,
    rawBody,
  });

  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.equal(enqueueCalls.length, 0, 'push event should not enqueue');
});
