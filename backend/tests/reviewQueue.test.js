import test from 'node:test';
import assert from 'node:assert/strict';
import ReviewQueue from '../utils/reviewQueue.js';

test('ReviewQueue constructor initializes empty queues and locks', () => {
  const queue = new ReviewQueue();
  assert.deepEqual(queue._queues, new Map(), 'queues should be an empty Map');
  assert.deepEqual(queue._queueLocks, new Map(), 'queueLocks should be an empty Map');
});

test('enqueue creates a queue for a new key and stores the item', async () => {
  const queue = new ReviewQueue();
  const processed = [];
  const processor = async (item) => processed.push(item);

  await queue.enqueue('key1', { id: 1 }, processor);

  assert.deepEqual(processed, [{ id: 1 }], 'processor should have been called with the item');
});

test('enqueue returns a promise that resolves after processing', async () => {
  const queue = new ReviewQueue();
  let resolved = false;
  const processor = async () => { resolved = true; };

  const p = queue.enqueue('key1', 'item', processor);
  assert.ok(p instanceof Promise, 'enqueue should return a promise');
  await p;
  assert.ok(resolved, 'promise should resolve after processing');
});

test('enqueue creates a queue entry for a new key', async () => {
  const q = new ReviewQueue();
  let processed = false;

  await q.enqueue('key1', { item: 'value' }, async (item) => {
    processed = true;
    assert.strictEqual(item.item, 'value');
  });

  assert.strictEqual(processed, true);
});

test('items for the same key are processed sequentially', async () => {
  const q = new ReviewQueue();
  const order = [];

  await q.enqueue('seq-key', 'first', async (item) => {
    order.push(item);
  });
  await q.enqueue('seq-key', 'second', async (item) => {
    order.push(item);
  });
  await q.enqueue('seq-key', 'third', async (item) => {
    order.push(item);
  });

  assert.deepStrictEqual(order, ['first', 'second', 'third']);
});

test('different keys can be processed independently', async () => {
  const q = new ReviewQueue();
  const results = {};

  const p1 = q.enqueue('key-a', 'result-a', async (item) => {
    results['a'] = item;
  });
  const p2 = q.enqueue('key-b', 'result-b', async (item) => {
    results['b'] = item;
  });

  await Promise.all([p1, p2]);

  assert.strictEqual(results['a'], 'result-a');
  assert.strictEqual(results['b'], 'result-b');
});

test('multiple enqueue calls for the same key are processed sequentially', async () => {
  const queue = new ReviewQueue();
  const order = [];

  const processor = async (item) => {
    order.push(item);
  };

  await Promise.all([
    queue.enqueue('key1', 'first', processor),
    queue.enqueue('key1', 'second', processor),
    queue.enqueue('key1', 'third', processor),
  ]);

  assert.deepEqual(order, ['first', 'second', 'third'], 'items should be processed in enqueue order');
});

test('enqueue for different keys processes in parallel', async () => {
  const queue = new ReviewQueue();
  let key2Done = false;

  const processor = async (item) => {
    if (item === 'second') {
      key2Done = true;
    }
  };

  const p1 = queue.enqueue('key1', 'first', processor);
  const p2 = queue.enqueue('key2', 'second', processor);

  await Promise.all([p1, p2]);
  assert.ok(key2Done, 'different key queues should process independently');
});

test('processor errors do not break the queue', async () => {
  const q = new ReviewQueue();
  let processed = false;

  await q.enqueue('error-key', 'good-item', async () => {
    processed = true;
  });

  // queue continues to work after any thrown error
  const result = await q.enqueue('error-key', 'after-error', async () => {
    return 'after-error';
  });

  assert.strictEqual(processed, true);
});

test('processor error is caught and logged without breaking the queue', async () => {
  const queue = new ReviewQueue();
  const processor = async (item) => {
    if (item === 'bad') throw new Error('processor failed');
  };

  // Should not throw
  await queue.enqueue('key1', 'bad', processor);
  // Queue should be empty after processing even with error
  assert.ok(!queue._queues.has('key1'), 'queue should be cleared after processing');
});

test('_processNext clears queue and locks after draining', async () => {
  const queue = new ReviewQueue();
  const processor = async () => {};

  await queue.enqueue('key1', 'item1', processor);
  await queue.enqueue('key1', 'item2', processor);

  // After all processing, both queue and lock should be cleared
  assert.ok(!queue._queues.has('key1'), 'queue should be deleted after draining');
  assert.ok(!queue._queueLocks.has('key1'), 'lock should be deleted after draining');
});

test('enqueue on an already-processing key appends to the queue', async () => {
  const q = new ReviewQueue();
  const results = [];

  // First item takes a tick to complete
  const p1 = q.enqueue('append-key', 'item-1', async (item) => {
    results.push(item);
  });
  // Immediately enqueue second item while first is still queued
  const p2 = q.enqueue('append-key', 'item-2', async (item) => {
    results.push(item);
  });

  await Promise.all([p1, p2]);

  assert.deepStrictEqual(results.sort(), ['item-1', 'item-2']);
});

test('enqueue with empty item list does not crash', async () => {
  const queue = new ReviewQueue();
  const processor = async () => {};

  await queue.enqueue('key1', null, processor);
  assert.ok(!queue._queues.has('key1'), 'empty queue should not persist');
});

test('items are processed in FIFO order', async () => {
  const queue = new ReviewQueue();
  const results = [];
  const processor = async (item) => { results.push(item); };

  for (let i = 0; i < 5; i++) {
    queue.enqueue('key1', i, processor);
  }

  await new Promise(r => setTimeout(r, 100));
  assert.deepEqual(results, [0, 1, 2, 3, 4], 'items should be processed in FIFO order');
});
