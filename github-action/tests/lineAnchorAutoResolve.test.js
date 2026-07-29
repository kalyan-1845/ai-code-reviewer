import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHunksByFile, mapOldLineToNew } from '../utils/diffHunkMapper.js';
import { filterDuplicateComments, autoResolveFixedThreads } from '../src/reviewer.js';

// ---------------------------------------------------------------------------
// Unit tests: diffHunkMapper (Hunk Parsing & Offset Math)
// ---------------------------------------------------------------------------

test('mapOldLineToNew returns original line for empty or invalid diff', () => {
  const result = mapOldLineToNew('', 'src/app.js', 15);
  assert.deepStrictEqual(result, { newLine: 15, isDeleted: false, isShifted: false, offset: 0 });
});

test('mapOldLineToNew returns original line for unmodified file', () => {
  const diff = `diff --git a/src/other.js b/src/other.js
--- a/src/other.js
+++ b/src/other.js
@@ -1,3 +1,4 @@
 line 1
+line 1.5
 line 2`;
  const result = mapOldLineToNew(diff, 'src/unmodified.js', 25);
  assert.deepStrictEqual(result, { newLine: 25, isDeleted: false, isShifted: false, offset: 0 });
});

test('mapOldLineToNew returns unshifted line if line is before first hunk', () => {
  const diff = `diff --git a/src/app.js b/src/app.js
--- a/src/app.js
+++ b/src/app.js
@@ -10,3 +10,6 @@
 line 10
+line 10.5
+line 10.6
+line 10.7
 line 11`;
  const result = mapOldLineToNew(diff, 'src/app.js', 5);
  assert.equal(result.newLine, 5);
  assert.equal(result.isDeleted, false);
  assert.equal(result.isShifted, false);
});

test('mapOldLineToNew computes positive shift for lines after added lines', () => {
  const diff = `diff --git a/src/app.js b/src/app.js
--- a/src/app.js
+++ b/src/app.js
@@ -5,3 +5,5 @@
 line 5
+added 1
+added 2
 line 6
 line 7`;
  const result = mapOldLineToNew(diff, 'src/app.js', 10);
  assert.equal(result.newLine, 12); // +2 shift
  assert.equal(result.isDeleted, false);
  assert.equal(result.isShifted, true);
  assert.equal(result.offset, 2);
});

test('mapOldLineToNew identifies deleted lines correctly', () => {
  const diff = `diff --git a/src/app.js b/src/app.js
--- a/src/app.js
+++ b/src/app.js
@@ -5,3 +5,2 @@
 line 5
-deleted line 6
 line 7`;
  const result = mapOldLineToNew(diff, 'src/app.js', 6);
  assert.equal(result.isDeleted, true);
});

test('mapOldLineToNew handles multiple hunks in a single file', () => {
  const diff = `diff --git a/src/app.js b/src/app.js
--- a/src/app.js
+++ b/src/app.js
@@ -5,2 +5,3 @@
 line 5
+added at 6
 line 6
@@ -20,2 +21,4 @@
 line 20
+added at 21
+added at 22
 line 21`;

  // Before 1st hunk (line 2)
  assert.equal(mapOldLineToNew(diff, 'src/app.js', 2).newLine, 2);
  // Between 1st and 2nd hunk (line 12): +1 shift
  assert.equal(mapOldLineToNew(diff, 'src/app.js', 12).newLine, 13);
  // After 2nd hunk (line 30): +1 from 1st hunk + 2 from 2nd hunk = +3 shift
  assert.equal(mapOldLineToNew(diff, 'src/app.js', 30).newLine, 33);
});

// ---------------------------------------------------------------------------
// Unit tests: filterDuplicateComments
// ---------------------------------------------------------------------------

test('filterDuplicateComments suppresses comment if identical REST comment exists', () => {
  const newComments = [
    { path: 'src/app.js', line: 10, body: 'Hardcoded password' }
  ];
  const existingComments = [
    { path: 'src/app.js', line: 10, body: 'Hardcoded password' }
  ];
  const filtered = filterDuplicateComments(newComments, [], existingComments, '');
  assert.equal(filtered.length, 0);
});

test('filterDuplicateComments suppresses comment if matching active GraphQL thread exists', () => {
  const newComments = [
    { path: 'src/app.js', line: 15, body: 'Uncaught Promise Rejection' }
  ];
  const existingThreads = [
    {
      id: 'thread_1',
      isResolved: false,
      path: 'src/app.js',
      line: 15,
      comments: { nodes: [{ body: 'Uncaught Promise Rejection' }] }
    }
  ];
  const filtered = filterDuplicateComments(newComments, existingThreads, [], '');
  assert.equal(filtered.length, 0);
});

test('filterDuplicateComments allows comment if active thread is resolved', () => {
  const newComments = [
    { path: 'src/app.js', line: 15, body: 'Uncaught Promise Rejection' }
  ];
  const existingThreads = [
    {
      id: 'thread_1',
      isResolved: true, // Resolved thread
      path: 'src/app.js',
      line: 15,
      comments: { nodes: [{ body: 'Uncaught Promise Rejection' }] }
    }
  ];
  const filtered = filterDuplicateComments(newComments, existingThreads, [], '');
  assert.equal(filtered.length, 1);
});

// ---------------------------------------------------------------------------
// Unit tests: autoResolveFixedThreads
// ---------------------------------------------------------------------------

test('autoResolveFixedThreads resolves thread if line was deleted in new commit', async () => {
  const diff = `diff --git a/src/app.js b/src/app.js
--- a/src/app.js
+++ b/src/app.js
@@ -10,3 +10,2 @@
 line 10
-line 11 with secret
 line 12`;

  const threads = [
    {
      id: 'thread_secret',
      isResolved: false,
      path: 'src/app.js',
      line: 11,
      comments: { nodes: [{ body: 'RepoSage Review Comment: Hardcoded secret', author: { login: 'github-actions[bot]' } }] }
    }
  ];

  const resolvedIds = [];
  const mockOctokit = {
    graphql: async (query, vars) => {
      resolvedIds.push(vars.threadId);
      return { resolveReviewThread: { thread: { id: vars.threadId, isResolved: true } } };
    }
  };

  const { resolvedCount } = await autoResolveFixedThreads(mockOctokit, { owner: 'o', repo: 'r', pullNumber: 1 }, {
    threads,
    diff,
    newIssues: []
  });

  assert.equal(resolvedCount, 1);
  assert.deepEqual(resolvedIds, ['thread_secret']);
});

test('autoResolveFixedThreads resolves thread if issue is fixed and no longer flagged', async () => {
  const diff = '';
  const threads = [
    {
      id: 'thread_bug',
      isResolved: false,
      path: 'src/app.js',
      line: 20,
      comments: { nodes: [{ body: 'RepoSage AI: Fix null pointer', author: { login: 'reposage-bot' } }] }
    }
  ];

  const resolvedIds = [];
  const mockOctokit = {
    graphql: async (query, vars) => {
      resolvedIds.push(vars.threadId);
      return { resolveReviewThread: { thread: { id: vars.threadId, isResolved: true } } };
    }
  };

  const { resolvedCount } = await autoResolveFixedThreads(mockOctokit, { owner: 'o', repo: 'r', pullNumber: 1 }, {
    threads,
    diff,
    newIssues: [] // Issue fixed, newIssues is empty!
  });

  assert.equal(resolvedCount, 1);
  assert.deepEqual(resolvedIds, ['thread_bug']);
});
