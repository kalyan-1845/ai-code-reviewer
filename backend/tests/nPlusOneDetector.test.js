import test from 'node:test';
import assert from 'node:assert/strict';
import { detectNPlusOne } from '../utils/nPlusOneDetector.js';

test('detectNPlusOne returns false for non-string input', () => {
  assert.equal(detectNPlusOne(null), false);
  assert.equal(detectNPlusOne(undefined), false);
  assert.equal(detectNPlusOne(123), false);
  assert.equal(detectNPlusOne({}), false);
});

test('detectNPlusOne returns false when no loop keywords are present', () => {
  const code = 'function foo() { return 42; }';
  assert.equal(detectNPlusOne(code), false);
});

test('detectNPlusOne returns false when no ORM keywords are present', () => {
  const code = 'function foo() { for (let i = 0; i < 10; i++) { console.log(i); } }';
  assert.equal(detectNPlusOne(code), false);
});

test('detectNPlusOne detects .find() inside a for loop with braces on same line', () => {
  const code = `for (const id of ids) {
  const user = db.users.find({ id });
}`;
  assert.equal(detectNPlusOne(code), true);
});

test('detectNPlusOne detects .find() with no-brace single-line loop', () => {
  const code = 'for (const id of ids) db.find(id);';
  assert.equal(detectNPlusOne(code), true);
});

test('detectNPlusOne detects .query() inside a for loop', () => {
  const code = `for (const id of ids) {
  const result = db.query('SELECT * FROM users WHERE id = ?', id);
}`;
  assert.equal(detectNPlusOne(code), true);
});

test('detectNPlusOne detects .execute() inside a for loop', () => {
  const code = `for (let i = 0; i < n; i++) {
  db.execute('DELETE FROM logs WHERE id = ?', ids[i]);
}`;
  assert.equal(detectNPlusOne(code), true);
});

test('detectNPlusOne detects .select() inside a forEach loop', () => {
  const code = `users.forEach(u => {
  const profile = db.select('profiles', { userId: u.id });
});`;
  assert.equal(detectNPlusOne(code), true);
});

test('detectNPlusOne detects prisma ORM call inside a for loop', () => {
  const code = `for (const id of ids) {
  await prisma.user.findUnique({ where: { id } });
}`;
  assert.equal(detectNPlusOne(code), true);
});

test('detectNPlusOne detects .findMany() ORM call', () => {
  const code = `for (const tag of tags) {
  const posts = prisma.post.findMany({ where: { tag } });
}`;
  assert.equal(detectNPlusOne(code), true);
});

test('detectNPlusOne detects ORM call in classic while loop', () => {
  const code = `while (hasNext()) {
  const item = db.find({ id: nextId() });
}`;
  assert.equal(detectNPlusOne(code), true);
});

test('detectNPlusOne returns false when ORM call is before the loop', () => {
  const code = `const allUsers = db.users.find({});
for (const id of ids) {
  console.log(id);
}`;
  assert.equal(detectNPlusOne(code), false);
});

test('detectNPlusOne returns false when loop contains no ORM calls', () => {
  const code = `for (let i = 0; i < 10; i++) {
  console.log(i);
  const x = i * 2;
}`;
  assert.equal(detectNPlusOne(code), false);
});

test('detectNPlusOne tracks brace depth across nested if inside loop', () => {
  const code = `for (const id of ids) {
  if (id > 0) {
    const user = db.users.find({ id });
  }
}`;
  assert.equal(detectNPlusOne(code), true);
});

test('detectNPlusOne resets after loop body ends', () => {
  const code = `for (const id of ids) {
  if (id > 0) {
    const user = db.users.find({ id });
  }
}
const admin = db.users.find({ role: 'admin' });`;
  assert.equal(detectNPlusOne(code), true);
});

test('detectNPlusOne accepts fileName parameter without crashing', () => {
  const code = `for (const id of ids) { db.find(id); }`;
  assert.equal(detectNPlusOne(code, 'service.js'), true);
});

test('detectNPlusOne returns false when no N+1 even with fileName', () => {
  const code = `for (const x of xs) { console.log(x); }`;
  assert.equal(detectNPlusOne(code, 'utils.ts'), false);
});
