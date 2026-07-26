import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectNPlusOne } from '../utils/nPlusOneDetector.js';

test('detectNPlusOne returns false for non-string input', () => {
  assert.equal(detectNPlusOne(null), false);
  assert.equal(detectNPlusOne(undefined), false);
  assert.equal(detectNPlusOne(123), false);
  assert.equal(detectNPlusOne({}), false);
  assert.equal(detectNPlusOne([]), false);
});

test('detectNPlusOne returns false for empty string', () => {
  assert.equal(detectNPlusOne(''), false);
});

test('detectNPlusOne returns false when no loop patterns are present', () => {
  const code = 'function getUsers() { return db.query("SELECT * FROM users"); }';
  assert.equal(detectNPlusOne(code), false);
});

test('detectNPlusOne returns false when loop is present but no ORM call follows', () => {
  assert.equal(detectNPlusOne('for (let i = 0; i < 10; i++) { console.log(i); }'), false);
  assert.equal(detectNPlusOne('while (true) { count++; }'), false);
});

test('detectNPlusOne returns false when ORM call is present but no loop', () => {
  const code = 'const users = await db.find({ active: true });';
  assert.equal(detectNPlusOne(code), false);
});

test('detectNPlusOne returns true when ORM call is inside a for loop', () => {
  const code = 'for (const id of userIds) { const user = await db.findOne(id); }';
  assert.equal(detectNPlusOne(code), true);
});

test('detectNPlusOne returns true with traditional for loop and ORM call', () => {
  const code = 'for (let i = 0; i < items.length; i++) { results.push(db.select(items[i])); }';
  assert.equal(detectNPlusOne(code), true);
});

test('detectNPlusOne returns true when ORM call is inside a while loop', () => {
  const code = 'while (rows.next()) { const row = db.query(rows.value); }';
  assert.equal(detectNPlusOne(code), true);
});

test('detectNPlusOne returns true when ORM call is inside .map', () => {
  const code = 'const users = ids.map(id => db.find(id));';
  assert.equal(detectNPlusOne(code), true);
});

test('detectNPlusOne returns true when ORM call is inside .forEach', () => {
  const code = 'ids.forEach(id => { db.execute(id); });';
  assert.equal(detectNPlusOne(code), true);
});

test('detectNPlusOne returns true for prisma.user.findMany inside a loop', () => {
  const code = 'for (const orgId of orgIds) { const users = await prisma.user.findMany({ where: { orgId } }); }';
  assert.equal(detectNPlusOne(code), true);
});

test('detectNPlusOne returns true for prisma.post.update inside a loop', () => {
  const code = 'itemIds.forEach(id => { prisma.post.update({ where: { id }, data: { read: true } }); });';
  assert.equal(detectNPlusOne(code), true);
});

test('detectNPlusOne returns false when ORM call is after the loop body closes', () => {
  const code = 'for (let i = 0; i < 10; i++) { const x = 1; }\nconst result = db.find(id);';
  assert.equal(detectNPlusOne(code), false);
});

test('detectNPlusOne returns true for nested loop with ORM call in inner body', () => {
  const code = 'for (const a of as) { for (const b of bs) { db.select(b); } }';
  assert.equal(detectNPlusOne(code), true);
});

test('detectNPlusOne accepts optional fileName parameter without affecting result', () => {
  const code = 'for (const id of ids) { db.find(id); }';
  assert.equal(detectNPlusOne(code, 'service.js'), true);
  assert.equal(detectNPlusOne(code, ''), true);
});
