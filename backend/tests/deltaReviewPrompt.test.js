import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeltaReviewPrompt } from '../prompts/deltaReviewPrompt.js';

const originalWarn = console.warn;
console.warn = () => {};

test('buildDeltaReviewPrompt returns a string', () => {
  const result = buildDeltaReviewPrompt('--- /dev/null\n+const x = 1;');
  assert.strictEqual(typeof result, 'string');
  assert.ok(result.length > 0);
});

test('buildDeltaReviewPrompt embeds diff in triple-backtick fence with diff tag', () => {
  const diff = '--- a/file.js\n+++ b/file.js\n@@ -1 +1 @@\n-old\n+new';
  const result = buildDeltaReviewPrompt(diff);
  assert.ok(result.includes('```diff\n' + diff + '\n```'), 'Diff should be embedded in fenced code block');
});

test('buildDeltaReviewPrompt includes instructions to focus on added lines', () => {
  const result = buildDeltaReviewPrompt('+console.log("hello")');
  assert.ok(
    result.includes('focus') && result.includes('added'),
    'Prompt should instruct focus on added lines'
  );
  assert.ok(
    result.includes('EXCLUSIVELY on the newly added code'),
    'Prompt should say exclusively on newly added code'
  );
});

test('buildDeltaReviewPrompt instructs to ignore deleted lines', () => {
  const result = buildDeltaReviewPrompt('-const x = 1;');
  assert.ok(
    result.includes('DO NOT critique or comment on these lines'),
    'Prompt should instruct not to critique deleted lines'
  );
});

test('buildDeltaReviewPrompt with empty diff does not throw', () => {
  assert.doesNotThrow(() => {
    buildDeltaReviewPrompt('');
  });
});

test('buildDeltaReviewPrompt with multi-line diff includes all lines', () => {
  const diff = `--- a/app.js
+++ b/app.js
@@ -1,3 +1,4 @@
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
 const d = 5;`;
  const result = buildDeltaReviewPrompt(diff);
  assert.ok(result.includes('-const b = 2;'), 'Deleted line should appear in prompt');
  assert.ok(result.includes('+const b = 3;'), 'Added line should appear in prompt');
  assert.ok(result.includes('+const c = 4;'), 'Added line should appear in prompt');
  assert.ok(result.includes('const d = 5;'), 'Context line should appear in prompt');
});

test('buildDeltaReviewPrompt contains the expert AI Code Reviewer role declaration', () => {
  const result = buildDeltaReviewPrompt('+hello');
  assert.ok(
    result.includes('expert AI Code Reviewer'),
    'Prompt should declare expert AI Code Reviewer role'
  );
});

console.warn = originalWarn;

test('buildDeltaReviewPrompt handles null input without throwing', () => {
  assert.doesNotThrow(() => {
    buildDeltaReviewPrompt(null);
  });
  const result = buildDeltaReviewPrompt(null);
  assert.strictEqual(typeof result, 'string');
});

test('buildDeltaReviewPrompt handles undefined input without throwing', () => {
  assert.doesNotThrow(() => {
    buildDeltaReviewPrompt(undefined);
  });
});

test('buildDeltaReviewPrompt handles diff with backtick characters', () => {
  // Diff content containing backticks should be safely embedded
  const diff = '+const greeting = `Hello, world!`;';
  assert.doesNotThrow(() => {
    buildDeltaReviewPrompt(diff);
  });
  const result = buildDeltaReviewPrompt(diff);
  assert.ok(result.includes('+const greeting'), 'Added line should appear in prompt');
});

test('buildDeltaReviewPrompt handles diff with triple-backtick injection attempt', () => {
  // Ensure triple backticks in diff content do not break the fence
  const diff = '+const code = ```\ncode block\n```;';
  assert.doesNotThrow(() => {
    buildDeltaReviewPrompt(diff);
  });
  const result = buildDeltaReviewPrompt(diff);
  assert.ok(result.includes('+const code'), 'Diff content should be included');
});

test('buildDeltaReviewPrompt handles very large diff without crashing', () => {
  const largeLine = '+' + 'a'.repeat(500);
  const largeDiff = Array.from({ length: 100 }, () => largeLine).join('\n');
  assert.doesNotThrow(() => {
    buildDeltaReviewPrompt(largeDiff);
  });
  const result = buildDeltaReviewPrompt(largeDiff);
  assert.ok(result.length > 0, 'Result should be non-empty');
  assert.ok(result.includes(largeLine), 'Large diff lines should be included');
});

test('buildDeltaReviewPrompt marks lines starting with plus for newly added code only', () => {
  const result = buildDeltaReviewPrompt('+console.log(1)');
  assert.ok(result.includes('focus') && result.includes('EXCLUSIVELY on the newly added code'));
  assert.ok(result.includes('+console.log(1)'), 'Added line should be in prompt');
});

test('buildDeltaReviewPrompt handles binary-like content without corrupting prompt', () => {
  const binaryDiff = `GIT binary patch
literal 10
zcmX@|A|%G40000000000000000000000000000000000000000000000000000000`;
  assert.doesNotThrow(() => {
    buildDeltaReviewPrompt(binaryDiff);
  });
  const result = buildDeltaReviewPrompt(binaryDiff);
  assert.ok(result.includes('expert AI Code Reviewer'));
  assert.ok(result.includes(binaryDiff), 'Binary content should be safely embedded');
});

test('buildDeltaReviewPrompt returns a non-empty string for any valid diff input', () => {
  const diffs = [
    '+const x = 1;',
    '-const y = 2;',
    '@@ -1,3 +1,4 @@',
    ' ',
    'some context'
  ];
  for (const diff of diffs) {
    const result = buildDeltaReviewPrompt(diff);
    assert.strictEqual(typeof result, 'string');
    assert.ok(result.length > 0, 'Prompt string should not be empty');
  }
});

console.warn = originalWarn;
