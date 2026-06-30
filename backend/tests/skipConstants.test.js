import test from 'node:test';
import assert from 'node:assert/strict';

const originalWarn = console.warn;
console.warn = () => {};

test('HARD_SKIP_DIRS is a Set', async () => {
  const { HARD_SKIP_DIRS } = await import('../utils/skipConstants.js');
  assert.ok(HARD_SKIP_DIRS instanceof Set);
});

test('HARD_SKIP_DIRS contains node_modules', async () => {
  const { HARD_SKIP_DIRS } = await import('../utils/skipConstants.js');
  assert.ok(HARD_SKIP_DIRS.has('node_modules'));
});

test('HARD_SKIP_DIRS contains .git', async () => {
  const { HARD_SKIP_DIRS } = await import('../utils/skipConstants.js');
  assert.ok(HARD_SKIP_DIRS.has('.git'));
});

test('HARD_SKIP_DIRS contains dist', async () => {
  const { HARD_SKIP_DIRS } = await import('../utils/skipConstants.js');
  assert.ok(HARD_SKIP_DIRS.has('dist'));
});

test('HARD_SKIP_DIRS contains build', async () => {
  const { HARD_SKIP_DIRS } = await import('../utils/skipConstants.js');
  assert.ok(HARD_SKIP_DIRS.has('build'));
});

test('HARD_SKIP_DIRS contains .venv', async () => {
  const { HARD_SKIP_DIRS } = await import('../utils/skipConstants.js');
  assert.ok(HARD_SKIP_DIRS.has('.venv'));
});

test('HARD_SKIP_DIRS contains __pycache__', async () => {
  const { HARD_SKIP_DIRS } = await import('../utils/skipConstants.js');
  assert.ok(HARD_SKIP_DIRS.has('__pycache__'));
});

test('HARD_SKIP_DIRS does not contain src', async () => {
  const { HARD_SKIP_DIRS } = await import('../utils/skipConstants.js');
  assert.ok(!HARD_SKIP_DIRS.has('src'));
});

test('HARD_SKIP_DIRS does not contain random directory name', async () => {
  const { HARD_SKIP_DIRS } = await import('../utils/skipConstants.js');
  assert.ok(!HARD_SKIP_DIRS.has('nonexistent_dir'));
});

test('HARD_SKIP_DIRS has exactly 6 entries', async () => {
  const { HARD_SKIP_DIRS } = await import('../utils/skipConstants.js');
  assert.strictEqual(HARD_SKIP_DIRS.size, 6);
});

console.warn = originalWarn;
