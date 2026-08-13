import test from 'node:test';
import assert from 'node:assert/strict';
import { createWebhookRateLimiter, webhookRateLimiter } from '../middleware/rateLimiter.js';

class MockRedisClient {
  constructor() {
    this.data = new Map();
    this.status = 'ready';
    this.shouldThrow = false;
  }

  async hgetall(key) {
    if (this.shouldThrow) {
      throw new Error('Redis connection error');
    }
    return this.data.get(key) || null;
  }

  async hset(key, field1, val1, field2, val2) {
    if (this.shouldThrow) {
      throw new Error('Redis connection error');
    }
    let map = this.data.get(key) || {};
    if (typeof field1 === 'object') {
      map = { ...map, ...field1 };
    } else {
      map[field1] = val1;
      if (field2) map[field2] = val2;
    }
    this.data.set(key, map);
  }

  async expire(key, seconds) {
    if (this.shouldThrow) {
      throw new Error('Redis connection error');
    }
    return 1;
  }

  pipeline() {
    const self = this;
    const commands = [];
    return {
      hset(...args) {
        commands.push(() => self.hset(...args));
        return this;
      },
      expire(...args) {
        commands.push(() => self.expire(...args));
        return this;
      },
      async exec() {
        if (self.shouldThrow) {
          throw new Error('Redis connection error in pipeline execution');
        }
        for (const cmd of commands) {
          await cmd();
        }
        return [[null, 'OK'], [null, 1]];
      }
    };
  }
}

const mockRes = () => {
  const res = {};
  res.statusCode = 200;
  res.body = null;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  return res;
};

test('createWebhookRateLimiter: allows 5 requests and blocks the 6th with 429 status', async () => {
  const redis = new MockRedisClient();
  const limiter = createWebhookRateLimiter({ redisClient: redis, maxTokens: 5, windowMs: 3600000 });

  const req = { body: { repository: { id: 101 } } };

  // First 5 requests should pass
  for (let i = 1; i <= 5; i++) {
    let nextCalled = false;
    const res = mockRes();
    await limiter(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true, `Request ${i} should be allowed`);
    assert.equal(res.statusCode, 200);
  }

  // 6th request within window should return 429
  let nextCalled6 = false;
  const res6 = mockRes();
  await limiter(req, res6, () => { nextCalled6 = true; });
  assert.equal(nextCalled6, false, 'Request 6 should be rate limited');
  assert.equal(res6.statusCode, 429);
  assert.equal(res6.body.error, 'Rate limit exceeded. Maximum 5 PR reviews per hour per repository.');
});

test('createWebhookRateLimiter: fails open when Redis throws an error', async () => {
  const redis = new MockRedisClient();
  redis.shouldThrow = true;
  const limiter = createWebhookRateLimiter({ redisClient: redis, maxTokens: 5, windowMs: 3600000 });

  const req = { body: { repository: { id: 202 } } };
  const res = mockRes();
  let nextCalled = false;

  await limiter(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true, 'Should fail open and call next() on Redis error');
  assert.equal(res.statusCode, 200);
});

test('createWebhookRateLimiter: isolates rate limits per repository.id', async () => {
  const redis = new MockRedisClient();
  const limiter = createWebhookRateLimiter({ redisClient: redis, maxTokens: 5, windowMs: 3600000 });

  const req1 = { body: { repository: { id: 301 } } };
  const req2 = { body: { repository: { id: 302 } } };

  // Consume 5 tokens for repo 301
  for (let i = 0; i < 5; i++) {
    const res = mockRes();
    await limiter(req1, res, () => {});
  }

  // 6th request for repo 301 is blocked
  const resBlocked = mockRes();
  let next1 = false;
  await limiter(req1, resBlocked, () => { next1 = true; });
  assert.equal(next1, false);
  assert.equal(resBlocked.statusCode, 429);

  // 1st request for repo 302 is allowed
  const resAllowed = mockRes();
  let next2 = false;
  await limiter(req2, resAllowed, () => { next2 = true; });
  assert.equal(next2, true);
  assert.equal(resAllowed.statusCode, 200);
});

test('createWebhookRateLimiter: passes through if request has no repository identifier', async () => {
  const limiter = createWebhookRateLimiter();
  const req = { body: {} };
  const res = mockRes();
  let nextCalled = false;

  await limiter(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('createWebhookRateLimiter: operates in-memory when Redis is not provided', async () => {
  const limiter = createWebhookRateLimiter({ maxTokens: 5, windowMs: 3600000 });
  const req = { body: { repository: { id: 404 } } };

  for (let i = 1; i <= 5; i++) {
    let nextCalled = false;
    const res = mockRes();
    await limiter(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  }

  const res6 = mockRes();
  let nextCalled6 = false;
  await limiter(req, res6, () => { nextCalled6 = true; });
  assert.equal(nextCalled6, false);
  assert.equal(res6.statusCode, 429);
});
