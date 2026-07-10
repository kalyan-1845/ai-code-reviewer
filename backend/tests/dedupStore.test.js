import test from 'node:test';
import assert from 'node:assert/strict';
import DedupStore from '../utils/dedupStore.js';

test('DedupStore: initializes memory map and sets value', async () => {
  const store = new DedupStore(null);
  await store.set('key1', 'value1', 1000);
  const val = await store.get('key1');
  assert.equal(val, 'value1');
  store.destroy();
});

test('DedupStore: handles expiration correctly', async () => {
  const store = new DedupStore(null);
  await store.set('key1', 'value1', 5);
  await new Promise(resolve => setTimeout(resolve, 15));
  const val = await store.get('key1');
  assert.equal(val, null);
  store.destroy();
});

test('DedupStore: handles sets correctly', async () => {
  const store = new DedupStore(null);
  await store.addToSet('set1', 'member1');
  let isMember = await store.isMember('set1', 'member1');
  assert.equal(isMember, true);

  await store.removeFromSet('set1', 'member1');
  isMember = await store.isMember('set1', 'member1');
  assert.equal(isMember, false);
  store.destroy();
});
