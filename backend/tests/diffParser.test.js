import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDiff, countLinesInDiff } from '../utils/diffParser.js';

test('parseDiff should return empty result for invalid input', () => {
  assert.deepEqual(parseDiff(null), { files: [], binaryFiles: [] });
  assert.deepEqual(parseDiff(undefined), { files: [], binaryFiles: [] });
  assert.deepEqual(parseDiff(123), { files: [], binaryFiles: [] });
  assert.deepEqual(parseDiff(''), { files: [], binaryFiles: [] });
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
  const { files: result } = parseDiff(diff);
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
  const { files: result } = parseDiff(diff);
  assert.equal(result.length, 2);
  assert.equal(result[0].path, 'file1.js');
  assert.equal(result[0].changes[0].line, 1);
  assert.equal(result[1].path, 'file2.js');
  assert.equal(result[1].changes[0].line, 5);
});

test('countLinesInDiff returns 0 for null/undefined input', () => {
  assert.equal(countLinesInDiff(null), 0);
  assert.equal(countLinesInDiff(undefined), 0);
});

test('countLinesInDiff returns 0 for empty array', () => {
  assert.equal(countLinesInDiff([]), 0);
});

test('countLinesInDiff returns correct count for single file', () => {
  const files = [{ path: 'a.js', changes: [{ line: 1, content: 'a' }, { line: 2, content: 'b' }, { line: 3, content: 'c' }] }];
  assert.equal(countLinesInDiff(files), 3);
});

test('countLinesInDiff returns correct count for multiple files', () => {
  const files = [
    { path: 'a.js', changes: [{ line: 1, content: 'a' }] },
    { path: 'b.js', changes: [{ line: 5, content: 'b' }, { line: 6, content: 'c' }] },
    { path: 'c.js', changes: [] },
  ];
  assert.equal(countLinesInDiff(files), 3);
});

test('countLinesInDiff returns 0 when changes is missing or not an array', () => {
  const files = [{ path: 'a.js' }, { path: 'b.js', changes: null }, { path: 'c.js', changes: undefined }];
  assert.equal(countLinesInDiff(files), 0);
});

test('parseDiff handles file rename diffs gracefully', () => {
  const diff = `
diff --git a/old_name.txt b/new_name.txt
similarity index 95%
rename from old_name.txt
rename to new_name.txt
index abc1234..def5678 100644
--- a/old_name.txt
+++ b/new_name.txt
@@ -1 +1 @@
-old content
+new content
  `;
  const { files: result } = parseDiff(diff);
  // Should extract path from "b/new_name.txt"
  assert.equal(result.length, 1);
  assert.equal(result[0].path, 'new_name.txt');
  assert.equal(result[0].changes.length, 1);
  assert.equal(result[0].changes[0].content, 'new content');
});

test('parseDiff handles binary file diffs gracefully', () => {
  const diff = `
diff --git a/image.png b/image.png
new file mode 100644
index 0000000..1234567
Binary files /dev/null and b/image.png differ
  `;
  const { files: result, binaryFiles } = parseDiff(diff);
  // Binary diff has no additions starting with +, so file should have 0 changes
  assert.equal(result.length, 1);
  assert.equal(result[0].path, 'image.png');
  assert.equal(result[0].changes.length, 0);
  assert.equal(binaryFiles.length, 1);
  assert.equal(binaryFiles[0], 'image.png');
});

test('parseDiff handles newly added file', () => {
  const diff = `
diff --git a/newfile.js b/newfile.js
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/newfile.js
@@ -0,0 +1,3 @@
+const x = 1;
+const y = 2;
+const z = 3;
  `;
  const { files: result } = parseDiff(diff);
  assert.equal(result.length, 1);
  assert.equal(result[0].path, 'newfile.js');
  assert.equal(result[0].changes.length, 3);
  assert.equal(result[0].changes[0].line, 1);
  assert.equal(result[0].changes[0].content, 'const x = 1;');
});

test('parseDiff handles deleted file', () => {
  const diff = `
diff --git a/deleted.js b/deleted.js
deleted file mode 100644
index abc1234..0000000
--- a/deleted.js
+++ /dev/null
@@ -1,2 +0,0 @@
-const old = 1;
-const removed = 2;
  `;
  const { files: result } = parseDiff(diff);
  assert.equal(result.length, 1);
  assert.equal(result[0].path, 'deleted.js');
  assert.equal(result[0].changes.length, 0);
});

test('parseDiff handles multiple markers in the same file', () => {
  const diff = `
diff --git a/multi.js b/multi.js
index abc..def 100644
--- a/multi.js
+++ b/multi.js
@@ -1,2 +1,3 @@
 const a = 1;
+first addition
@@ -5,2 +5,3 @@
 const b = 5;
+second addition
  `;
  const { files: result } = parseDiff(diff);
  assert.equal(result.length, 1);
  assert.equal(result[0].changes.length, 2);
  // Line numbers reset after each @@ marker
  assert.equal(result[0].changes[0].line, 2);
  assert.equal(result[0].changes[1].line, 6);
});

test('parseDiff handles mode change only diff', () => {
  const diff = `
diff --git a/script.sh b/script.sh
old mode 100644
new mode 100755
  `;
  const { files: result } = parseDiff(diff);
  // No additions, no @@ markers -> file with empty changes
  assert.equal(result.length, 1);
  assert.equal(result[0].changes.length, 0);
});

test('countLinesInDiff handles files with null changes', () => {
  const files = [
    { path: 'a.js', changes: null },
    { path: 'b.js', changes: undefined },
    { path: 'c.js', changes: [null, { line: 1, content: 'x' }] },
  ];
  assert.equal(countLinesInDiff(files), 2);  // reduce skips non-arrays  // only one valid change
});

test('parseDiff handles diff with no trailing newline', () => {
  // Diff string without trailing newline
  const diff = 'diff --git a/test.js b/test.js\n--- a/test.js\n+++ b/test.js\n@@ -1 +1,2 @@\n+new line';
  const { files: result } = parseDiff(diff);
  assert.equal(result.length, 1);
  assert.equal(result[0].path, 'test.js');
  assert.equal(result[0].changes.length, 1);
});

test('parseDiff handles quoted filenames and paths containing b/', () => {
  const diffQuoted = 'diff --git "a/my file.js" "b/my file.js"\n--- "a/my file.js"\n+++ "b/my file.js"\n@@ -1 +1 @@\n+x';
  const resQuoted = parseDiff(diffQuoted).files;
  assert.equal(resQuoted.length, 1);
  assert.equal(resQuoted[0].path, 'my file.js');

  const diffContainingB = 'diff --git a/src/b/index.js b/src/b/index.js\n--- a/src/b/index.js\n+++ b/src/b/index.js\n@@ -1 +1 @@\n+y';
  const resContainingB = parseDiff(diffContainingB).files;
  assert.equal(resContainingB.length, 1);
  assert.equal(resContainingB[0].path, 'src/b/index.js');
});
