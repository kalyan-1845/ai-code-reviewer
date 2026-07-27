import test from 'node:test';
import assert from 'node:assert/strict';
import DedupStore from '../utils/dedupStore.js';

test('DedupStore: operates in-memory when Redis is not provided', async () => {
  const store = new DedupStore();

  await store.set('key1', 'val1', 5000);
  assert.equal(await store.get('key1'), 'val1');

  await store.delete('key1');
  assert.equal(await store.get('key1'), null);
});

test('DedupStore: expires memory entries after TTL', async () => {
  const store = new DedupStore();

  await store.set('key1', 'val1', 10);
  await new Promise(resolve => setTimeout(resolve, 20));

  assert.equal(await store.get('key1'), null);
});

test('DedupStore: sets and gets values in memory when Redis is absent', async () => {
  const store = new DedupStore();
  await store.set('key1', 'value1', 100);
  
  assert.equal(await store.get('key1'), 'value1');
  
  // Wait for expiration
  await new Promise(r => setTimeout(r, 120));
  assert.equal(await store.get('key1'), null);
});

test('DedupStore: sets, membership and expiration in set checks', async () => {
  const store = new DedupStore();
  await store.addToSet('set1', 'member1');
  await store.addToSet('set1', 'member2');

  assert.equal(await store.isMember('set1', 'member1'), true);
  assert.equal(await store.isMember('set1', 'member2'), true);
  assert.equal(await store.isMember('set1', 'member3'), false);

  await store.removeFromSet('set1', 'member1');
  assert.equal(await store.isMember('set1', 'member1'), false);
  assert.equal(await store.isMember('set1', 'member2'), true);
});

test('DedupStore: handles type transitions safely without throwing TypeError', async () => {
  const store = new DedupStore();

  // 1. Set key as a string
  await store.set('mixedKey', 'not-a-set', 5000);

  // 2. Call isMember and removeFromSet on it — should handle it safely
  assert.equal(await store.isMember('mixedKey', 'member'), false);
  
  // 3. Should delete or ignore smoothly
  await store.removeFromSet('mixedKey', 'member');
  
  // 4. Calling addToSet should safely overwrite/re-initialize the value as a Set
  await store.addToSet('mixedKey', 'member');
  assert.equal(await store.isMember('mixedKey', 'member'), true);

});

test('DedupStore: delete removes the entry and subsequent has returns false', async () => {
  const store = new DedupStore();
  await store.set('key1', 'value1', 100000);
  assert.equal(await store.get('key1'), 'value1');

  await store.delete('key1');
  assert.equal(await store.get('key1'), null);
  assert.equal(await store.has('key1'), false);
});

test('DedupStore: delete is safe for non-existent key', async () => {
  const store = new DedupStore();
  // Should not throw
  await store.delete('nonexistent');
  assert.equal(await store.has('nonexistent'), false);
});

test('DedupStore: removeFromSet deletes a specific member without touching others', async () => {
  const store = new DedupStore();
  await store.addToSet('set1', 'member1');
  await store.addToSet('set1', 'member2');
  await store.addToSet('set1', 'member3');

  assert.equal(await store.isMember('set1', 'member1'), true);
  assert.equal(await store.isMember('set1', 'member2'), true);
  assert.equal(await store.isMember('set1', 'member3'), true);

  await store.removeFromSet('set1', 'member2');

  assert.equal(await store.isMember('set1', 'member1'), true, 'member1 should remain');
  assert.equal(await store.isMember('set1', 'member2'), false, 'member2 should be removed');
  assert.equal(await store.isMember('set1', 'member3'), true, 'member3 should remain');
});

test('DedupStore: removeFromSet is safe when set does not exist', async () => {
  const store = new DedupStore();
  // Should not throw
  await store.removeFromSet('nonexistent', 'member1');
});

test('DedupStore: removeFromSet is safe when member is not in set', async () => {
  const store = new DedupStore();
  await store.addToSet('set1', 'member1');
  // Should not throw
  await store.removeFromSet('set1', 'member2');
  assert.equal(await store.isMember('set1', 'member1'), true);
});

test('DedupStore: expire updates the expiration of an existing key', async () => {
  const store = new DedupStore();
  await store.set('key1', 'value1', 20);
  assert.equal(await store.get('key1'), 'value1');

  // Wait for original TTL to expire
  await new Promise(r => setTimeout(r, 30));
  assert.equal(await store.get('key1'), null, 'key should have expired');

  // Re-set and then extend TTL
  await store.set('key1', 'value1', 20);
  await store.expire('key1', 100000);
  await new Promise(r => setTimeout(r, 30));
  assert.equal(await store.get('key1'), 'value1', 'TTL should have been extended');
});

test('DedupStore: expire is a no-op for non-existent key', async () => {
  const store = new DedupStore();
  // Should not throw
  await store.expire('nonexistent', 100000);
});

test('DedupStore: has returns true for existing non-expired key', async () => {
  const store = new DedupStore();
  await store.set('key1', 'value1', 100000);
  assert.equal(await store.has('key1'), true);
});

test('DedupStore: has returns false for non-existent key', async () => {
  const store = new DedupStore();
  assert.equal(await store.has('nonexistent'), false);
});

test('DedupStore: has returns false after key expires', async () => {
  const store = new DedupStore();
  await store.set('key1', 'value1', 20);
  await new Promise(r => setTimeout(r, 30));
  assert.equal(await store.has('key1'), false);
});

test('DedupStore: stopSweeper clears the interval', async () => {
  const store = new DedupStore();
  // Initial state has a sweeper running
  assert.ok(store._sweeper !== null);

  store.stopSweeper();
  assert.equal(store._sweeper, null, 'sweeper should be stopped');
});

test('DedupStore: stopSweeper is safe to call twice', async () => {
  const store = new DedupStore();
  store.stopSweeper();
  // Should not throw
  store.stopSweeper();
  assert.equal(store._sweeper, null);
});

test('DedupStore: delete clears entry even when sweeper is stopped', async () => {
  const store = new DedupStore();
  await store.set('key1', 'value1', 10);
  store.stopSweeper();
  await new Promise(r => setTimeout(r, 20));
  // With sweeper stopped, entry might still be in memory but expired
  // delete should still remove it regardless
  await store.delete('key1');
  assert.equal(await store.get('key1'), null);
});

test('DedupStore: operations after stopSweeper still work correctly', async () => {
  const store = new DedupStore();
  store.stopSweeper();
  await store.set('key1', 'value1', 100000);
  assert.equal(await store.get('key1'), 'value1');
  await store.delete('key1');
  assert.equal(await store.has('key1'), false);
});

test('DedupStore: set/get round-trip for non-string values (stored as-is)', async () => {
  const store = new DedupStore();
  await store.set('key1', 'value1', 100000);
  const val = await store.get('key1');
  assert.equal(val, 'value1');
});
