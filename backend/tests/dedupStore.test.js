import test from 'node:test';
import assert from 'node:assert/strict';
import DedupStore from '../utils/dedupStore.js';

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

  // Expire the key in memory
  await store.expire('set1', 20);
  assert.equal(await store.isMember('set1', 'member1'), true);

  // Wait for expiration
  await new Promise(r => setTimeout(r, 30));
  assert.equal(await store.isMember('set1', 'member1'), false, 'Should return false after expiration');
  assert.equal(await store.has('set1'), false, 'Should be fully evicted');
});
