import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDiff } from '../utils/diffParser.js';

// ----- basic structure -----

test('parseDiff returns empty files and binaryFiles for empty string', () => {
  const result = parseDiff('');
  assert.deepEqual(result, { files: [], binaryFiles: [] });
});

test('parseDiff returns empty files and binaryFiles for whitespace-only input', () => {
  const result = parseDiff('   \n\n  \n');
  assert.deepEqual(result, { files: [], binaryFiles: [] });
});

test('parseDiff returns empty files and binaryFiles when no diff headers present', () => {
  const result = parseDiff('some random text\nno diff headers here');
  assert.deepEqual(result, { files: [], binaryFiles: [] });
});

// ----- single file -----

test('parseDiff parses diff --git header and extracts file path', () => {
  const diff = `diff --git a/src/foo.js b/src/foo.js
--- a/src/foo.js
+++ b/src/foo.js
@@ -1,3 +1,4 @@
 line one
+added line
 line two
 line three`;
  const { files } = parseDiff(diff);
  assert.equal(files.length, 1);
  assert.equal(files[0].path, 'src/foo.js');
  assert.ok(Array.isArray(files[0].changes));
});

test('parseDiff tracks added lines with correct line numbers from hunk header', () => {
  const diff = `diff --git a/src/foo.js b/src/foo.js
--- a/src/foo.js
+++ b/src/foo.js
@@ -5,3 +5,4 @@
 context line 1
+new feature added here
 context line 2
 line three`;
  const { files } = parseDiff(diff);
  // hunk starts at +5; context line increments to 6; added at 6
  assert.equal(files[0].changes.length, 1);
  assert.equal(files[0].changes[0].line, 6);
  assert.equal(files[0].changes[0].content, 'new feature added here');
});

test('parseDiff increments line counter for consecutive added lines', () => {
  const diff = `diff --git a/src/foo.js b/src/foo.js
--- a/src/foo.js
+++ b/src/foo.js
@@ -1,2 +1,4 @@
 first line
+second added
+third added
 last line`;
  const { files } = parseDiff(diff);
  // hunk starts at +1; context increments to 2; added at 2 and 3
  assert.equal(files[0].changes.length, 2);
  assert.equal(files[0].changes[0].line, 2);
  assert.equal(files[0].changes[0].content, 'second added');
  assert.equal(files[0].changes[1].line, 3);
  assert.equal(files[0].changes[1].content, 'third added');
});

test('parseDiff captures removed lines in deletions', () => {
  const diff = `diff --git a/src/foo.js b/src/foo.js
--- a/src/foo.js
+++ b/src/foo.js
@@ -1,3 +1,2 @@
-first removed
 context line
+new added`;
  const { files } = parseDiff(diff);
  assert.equal(files[0].changes.length, 1);
  assert.equal(files[0].changes[0].content, 'new added');
  assert.equal(files[0].deletions.length, 1);
  assert.equal(files[0].deletions[0].content, 'first removed');
});

test('parseDiff increments line counter on context lines (space prefix)', () => {
  const diff = `diff --git a/src/foo.js b/src/foo.js
--- a/src/foo.js
+++ b/src/foo.js
@@ -1,5 +1,6 @@
 line a
+added after a
 context b
 context c
+added after c
 line d`;
  const { files } = parseDiff(diff);
  // hunk at +1; context increments to 2; added1 at 2; context+3; context+4; added2 at 4; context+5; added2 at 5
  assert.equal(files[0].changes.length, 2);
  assert.equal(files[0].changes[0].line, 2);
  assert.equal(files[0].changes[1].line, 5);
});

test('parseDiff strips the leading + from added line content', () => {
  const diff = `diff --git a/src/foo.js b/src/foo.js
--- a/src/foo.js
+++ b/src/foo.js
@@ -1,1 +1,2 @@
+const x = 1;`;
  const { files } = parseDiff(diff);
  assert.equal(files[0].changes[0].content, 'const x = 1;');
});

test('parseDiff ignores +++ lines (new file marker)', () => {
  const diff = `diff --git a/newfile.js b/newfile.js
--- /dev/null
+++ b/newfile.js
@@ -0,0 +1,2 @@
+++newfile.js
+first line of new file
+second line`;
  const { files } = parseDiff(diff);
  // The +++ line itself is ignored (startsWith +++ checked); both + lines captured
  assert.equal(files[0].changes.length, 2);
  assert.equal(files[0].changes[0].content, 'first line of new file');
  assert.equal(files[0].changes[1].content, 'second line');
});

// ----- multi-file diff -----

test('parseDiff handles multiple files in one diff', () => {
  const diff = `diff --git a/file1.js b/file1.js
--- a/file1.js
+++ b/file1.js
@@ -1,2 +1,3 @@
 line one
+added in file1
diff --git a/file2.js b/file2.js
--- a/file2.js
+++ b/file2.js
@@ -1,2 +1,3 @@
 line one
+added in file2`;
  const { files } = parseDiff(diff);
  assert.equal(files.length, 2);
  assert.equal(files[0].path, 'file1.js');
  assert.equal(files[0].changes[0].content, 'added in file1');
  assert.equal(files[1].path, 'file2.js');
  assert.equal(files[1].changes[0].content, 'added in file2');
});

test('parseDiff resets line counter per file', () => {
  const diff = `diff --git a/file1.js b/file1.js
--- a/file1.js
+++ b/file1.js
@@ -10,1 +10,2 @@
+added in file1 at line 10
diff --git a/file2.js b/file2.js
--- a/file2.js
+++ b/file2.js
@@ -1,1 +1,2 @@
+added in file2 at line 1`;
  const { files } = parseDiff(diff);
  assert.equal(files[0].changes[0].line, 10);
  assert.equal(files[1].changes[0].line, 1);
});

// ----- hunk header parsing -----

test('parseDiff handles hunk header without comma count (single line)', () => {
  const diff = `diff --git a/src/foo.js b/src/foo.js
--- a/src/foo.js
+++ b/src/foo.js
@@ -5 +5 @@
 context
+added at 5`;
  const { files } = parseDiff(diff);
  // hunk starts at +5; context increments to 6; added at 6
  assert.equal(files[0].changes[0].line, 6);
});

test('parseDiff handles hunk header with comma count', () => {
  const diff = `diff --git a/src/foo.js b/src/foo.js
--- a/src/foo.js
+++ b/src/foo.js
@@ -1,10 +1,11 @@
 ten lines here
+one more
 nine left`;
  const { files } = parseDiff(diff);
  // hunk starts at +1; context increments to 2; added at 2
  assert.equal(files[0].changes[0].line, 2);
});

test('parseDiff resets line number on new hunk within same file', () => {
  const diff = `diff --git a/src/foo.js b/src/foo.js
--- a/src/foo.js
+++ b/src/foo.js
@@ -1 +1,2 @@
+added in first hunk
@@ -10 +11,2 @@
+added in second hunk
 line at 12`;
  const { files } = parseDiff(diff);
  assert.equal(files[0].changes.length, 2);
  assert.equal(files[0].changes[0].line, 1);
  assert.equal(files[0].changes[1].line, 11);
});

// ----- file rename -----

test('parseDiff handles renamed file diff header', () => {
  const diff = `diff --git a/old.js b/new.js
similar file a/old.js b/new.js
--- a/old.js
+++ b/new.js
@@ -1,2 +1,3 @@
 content
+added after rename`;
  const { files } = parseDiff(diff);
  // Should capture the file; path is new.js (b/...)
  assert.equal(files.length, 1);
  assert.equal(files[0].path, 'new.js');
});

// ----- edge cases -----

test('parseDiff handles file with only removed lines', () => {
  const diff = `diff --git a/src/foo.js b/src/foo.js
--- a/src/foo.js
+++ b/src/foo.js
@@ -1,3 +1,3 @@
-line one
-line two
+Line three
 line four`;
  const { files } = parseDiff(diff);
  // Only the added line captured
  assert.equal(files[0].changes.length, 1);
  assert.equal(files[0].changes[0].content, 'Line three');
});

test('parseDiff handles +++ file creation hunk', () => {
  const diff = `diff --git a/brand.js b/brand.js
--- /dev/null
+++ b/brand.js
@@ -0,0 +1,1 @@
+first line of brand new file`;
  const { files } = parseDiff(diff);
  // hunk starts at +1; no content lines before added; added at 1
  assert.equal(files[0].changes.length, 1);
  assert.equal(files[0].changes[0].line, 1);
  assert.equal(files[0].changes[0].content, 'first line of brand new file');
});
