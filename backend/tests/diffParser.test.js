import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDiff } from '../utils/diffParser.js';

test('parseDiff should return empty array for invalid input', () => {
  assert.deepEqual(parseDiff(null), []);
  assert.deepEqual(parseDiff(undefined), []);
  assert.deepEqual(parseDiff(123), []);
  assert.deepEqual(parseDiff(''), []);
});

test('parseDiff should parse a valid single-file diff correctly', () => {
  const diff = `
diff --git a/backend/index.js b/backend/index.js
index 123456..789012 100644
--- a/backend/index.js
+++ b/backend/index.js
@@ -10,4 +10,5 @@
 const a = 1;
-const b = 2;
+const c = 3;
+const d = 4;
   `;
  const result = parseDiff(diff);
  assert.equal(result.length, 1);
  assert.equal(result[0].path, 'backend/index.js');
  assert.equal(result[0].changes.length, 2);
  assert.deepEqual(result[0].changes[0], { line: 11, content: 'const c = 3;' });
  assert.deepEqual(result[0].changes[1], { line: 12, content: 'const d = 4;' });
});

test('parseDiff should handle multiple file changes', () => {
  const diff = `
diff --git a/file1.js b/file1.js
--- a/file1.js
+++ b/file1.js
@@ -1,2 +1,3 @@
+console.log("file1");
diff --git a/file2.js b/file2.js
--- a/file2.js
+++ b/file2.js
@@ -5,1 +5,2 @@
+console.log("file2");
  `;
  const result = parseDiff(diff);
  assert.equal(result.length, 2);
  assert.equal(result[0].path, 'file1.js');
  assert.equal(result[0].changes[0].line, 1);
  assert.equal(result[1].path, 'file2.js');
  assert.equal(result[1].changes[0].line, 5);
});
