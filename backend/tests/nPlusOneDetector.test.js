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

test('detectNPlusOne: returns false when no loop or query pattern is present', () => {
  const code = 'const x = 1;\nconst y = 2;\nreturn x + y;';
  assert.equal(detectNPlusOne(code), false);
});

test('detectNPlusOne: returns false for loop without DB call', () => {
  const code = 'for (let i = 0; i < 10; i++) { console.log(i); }';
  assert.equal(detectNPlusOne(code), false);
});

test('detectNPlusOne: returns false for query without loop', () => {
  const code = 'const users = db.findAll();\nreturn users;';
  assert.equal(detectNPlusOne(code), false);
});

test('detectNPlusOne: detects for-loop with ORM call', () => {
  const code = 'for (const id of ids) {\n  const user = db.findOne({ id });\n}';
  assert.equal(detectNPlusOne(code), true);
});

test('detectNPlusOne: detects .map with prisma call', () => {
  const code = 'const results = ids.map(id => prisma.user.findUnique({ where: { id } }));';
  assert.equal(detectNPlusOne(code), true);
});

test('detectNPlusOne: detects while loop with DB call', () => {
  const code = 'while (hasMore) {\n  const batch = db.query("SELECT * FROM items LIMIT 100");\n}';
  assert.equal(detectNPlusOne(code), true);
});

test('detectNPlusOne: handles brace depth correctly - nested loops without DB', () => {
  const code = 'for (let i = 0; i < 10; i++) {\n  for (let j = 0; j < 10; j++) {\n    console.log(i, j);\n  }\n}';
  assert.equal(detectNPlusOne(code), false);
});

test('detectNPlusOne: uses fileName parameter without crashing', () => {
  const code = 'for (const id of ids) { db.findOne({ id }); }';
  assert.equal(detectNPlusOne(code, 'service.js'), true);
});

test('detectNPlusOne: returns false when brace depth exits loop before DB call', () => {
  const code = 'for (let i = 0; i < 10; i++) {\n  const x = 1;\n}\nconst user = db.findOne({ id: 1 });';
  assert.equal(detectNPlusOne(code), false);
});
