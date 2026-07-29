import test from 'node:test';
import assert from 'node:assert/strict';
import { detectNPlusOne } from '../utils/nPlusOneDetector.js';

test('detectNPlusOne: returns false for non-string input', () => {
  assert.equal(detectNPlusOne(null), false);
  assert.equal(detectNPlusOne(undefined), false);
  assert.equal(detectNPlusOne(123), false);
  assert.equal(detectNPlusOne({}), false);
  assert.equal(detectNPlusOne([]), false);
});

test('detectNPlusOne: returns false when content has no loop or iterator', () => {
  assert.equal(detectNPlusOne('const x = 1;\ny = x + 2;'), false);
});

test('detectNPlusOne: returns false when content has loop but no ORM pattern', () => {
  const code = 'for (let i = 0; i < 10; i++) {\n  console.log(i);\n}';
  assert.equal(detectNPlusOne(code), false);
});

test('detectNPlusOne: returns false when content has ORM but no loop', () => {
  const code = 'const result = db.users.find({ active: true });';
  assert.equal(detectNPlusOne(code), false);
});

test('detectNPlusOne: returns true when loop contains ORM .find() call', () => {
  const code = 'for (const id of userIds) {\n  const user = db.users.find({ id });\n}';
  assert.equal(detectNPlusOne(code), true);
});

test('detectNPlusOne: returns true when loop contains ORM .query() call', () => {
  const code = 'while (count < 10) {\n  db.query("SELECT * FROM users");\n  count++;\n}';
  assert.equal(detectNPlusOne(code), true);
});

test('detectNPlusOne: returns true when loop contains Prisma ORM call', () => {
  const code = 'users.forEach(async (u) => {\n  await prisma.user.findMany({ where: { id: u.id } });\n});';
  assert.equal(detectNPlusOne(code), true);
});

test('detectNPlusOne: returns true when .map() contains ORM call', () => {
  const code = 'const results = items.map(item => db.table.select("*"))';
  assert.equal(detectNPlusOne(code), true);
});

test('detectNPlusOne: returns false when loop has no ORM call', () => {
  const code = 'for (let i = 0; i < 10; i++) {\n  const x = i * 2;\n  console.log(x);\n}';
  assert.equal(detectNPlusOne(code), false);
});

test('detectNPlusOne: tracks brace depth correctly and exits loop', () => {
  // Loop with nested block but no ORM call until after loop closes
  const code = 'for (let i = 0; i < 10; i++) {\n  if (true) {\n    const x = 1;\n  }\n}\nconst y = db.find({});';
  // ORM call is outside the loop body (after loop closes), should be false
  assert.equal(detectNPlusOne(code), false);
});

test('detectNPlusOne: handles .findMany Prisma pattern', () => {
  const code = 'users.forEach(u => {\n  const posts = await prisma.post.findMany({ where: { authorId: u.id } });\n});';
  assert.equal(detectNPlusOne(code), true);
});

test('detectNPlusOne: handles .insert and .update ORM patterns', () => {
  const code = 'for (const item of items) {\n  db.collection.insert({ data: item });\n}';
  assert.equal(detectNPlusOne(code), true);
});
