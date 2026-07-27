import ReviewQueue from '../utils/reviewQueue.js';
import assert from 'assert';
import { describe, it, beforeEach } from 'node:test';

describe('ReviewQueue lock separation', () => {
  let reviewQueue;

  beforeEach(() => {
    reviewQueue = new ReviewQueue();
  });

  it('enqueue and runExclusive should not interfere with separate keys', async () => {
    const results = [];
    
    // Start enqueue for key1
    const enqueuePromise = reviewQueue.enqueue('key1', { id: 1 }, async (item) => {
      results.push(`enqueue-key1-${item.id}`);
      await new Promise(r => setTimeout(r, 50));
    });

    // Start runExclusive for key2 (different key)
    const exclusivePromise = reviewQueue.runExclusive('key2', async () => {
      results.push('exclusive-key2');
      await new Promise(r => setTimeout(r, 50));
    });

    await Promise.all([enqueuePromise, exclusivePromise]);

    // Both should complete without interference
    assert(results.includes('enqueue-key1-1'));
    assert(results.includes('exclusive-key2'));
  });

  it('enqueue and runExclusive on same key should serialize independently', async () => {
    const results = [];
    
    // Start enqueue for key1
    const enqueuePromise = reviewQueue.enqueue('key1', { id: 1 }, async (item) => {
      results.push(`enqueue-${item.id}-start`);
      await new Promise(r => setTimeout(r, 50));
      results.push(`enqueue-${item.id}-end`);
    });

    // runExclusive on different key should run in parallel
    const exclusivePromise = reviewQueue.runExclusive('key2', async () => {
      results.push('exclusive-start');
      await new Promise(r => setTimeout(r, 30));
      results.push('exclusive-end');
    });

    await Promise.all([enqueuePromise, exclusivePromise]);

    // exclusive should complete while enqueue is still running
    const enqueueStartIdx = results.indexOf('enqueue-1-start');
    const exclusiveStartIdx = results.indexOf('exclusive-start');
    const exclusiveEndIdx = results.indexOf('exclusive-end');
    const enqueueEndIdx = results.indexOf('enqueue-1-end');

    assert(exclusiveStartIdx > -1, 'exclusive should start');
    assert(exclusiveEndIdx > -1, 'exclusive should end');
    assert(exclusiveEndIdx < enqueueEndIdx, 'exclusive should end before enqueue on different key');
  });

  it('_queueLocks and _exclusiveLocks should be separate maps', () => {
    assert(reviewQueue._queueLocks instanceof Map, '_queueLocks should be a Map');
    assert(reviewQueue._exclusiveLocks instanceof Map, '_exclusiveLocks should be a Map');
    assert(reviewQueue._queueLocks !== reviewQueue._exclusiveLocks, 'locks should be separate Maps');
  });
});
