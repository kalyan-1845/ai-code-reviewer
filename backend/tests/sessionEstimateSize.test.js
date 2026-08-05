import test from 'node:test';
import assert from 'node:assert/strict';

const { estimateSessionSize } = await import('../models/Session.js');

const MAX_SESSION_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB — mirrors Session.js constant

test('estimateSessionSize returns 300 for empty files array', () => {
  // Base size 200 + overhead 100 = 300
  const result = estimateSessionSize([]);
  assert.equal(result, 300);
});

test('estimateSessionSize includes base size + overhead for single empty file', () => {
  // Base: 200 + overhead: 100 + file (name: '' content: '') -> 50 + 1.5 * (0+0) = 50
  // Total: 200 + 100 + 50 = 350
  const result = estimateSessionSize([{ name: '', content: '' }]);
  assert.equal(result, 350);
});

test('estimateSessionSize grows with file name length', () => {
  const short = estimateSessionSize([{ name: 'a.js', content: '' }]);
  const longer = estimateSessionSize([{ name: 'very-long-file-name-here.js', content: '' }]);
  assert.ok(longer > short, 'longer name should increase size');
});

test('estimateSessionSize grows with file content length', () => {
  const short = estimateSessionSize([{ name: 'file.txt', content: 'x'.repeat(100) }]);
  const longer = estimateSessionSize([{ name: 'file.txt', content: 'x'.repeat(1000) }]);
  assert.ok(longer > short, 'longer content should increase size');
});

test('estimateSessionSize accumulates across multiple files', () => {
  const one = estimateSessionSize([{ name: 'a.js', content: 'x' }]);
  const two = estimateSessionSize([
    { name: 'a.js', content: 'x' },
    { name: 'b.js', content: 'y' },
  ]);
  assert.ok(two > one, 'two files should have larger size than one');
});

test('estimateSessionSize returns immediately when size exceeds MAX_SESSION_SIZE_BYTES', () => {
  // Build a single file that exceeds the cap
  // We need 10MB worth: 50 + 1.5 * (byteLen(name) + byteLen(content)) >= 10MB
  // That means content needs to be approximately 6.7MB
  // Let's build a very large content
  const largeContent = 'x'.repeat(7 * 1024 * 1024); // 7 MB
  const result = estimateSessionSize([{ name: 'large.txt', content: largeContent }]);
  // Function should return as soon as size > MAX (so it will be > MAX)
  assert.ok(result > MAX_SESSION_SIZE_BYTES, 'large file should exceed MAX_SESSION_SIZE_BYTES');
});

test('estimateSessionSize does not include files after the cap is exceeded', () => {
  // Build a file whose per-file size exceeds MAX_SESSION_SIZE_BYTES (10MB).
  // Per-file size = 50 + 1.5 * (nameLen + contentLen).
  // nameLen=5MB, contentLen=5MB -> per-file = 15.7MB -> exceeds cap -> returns early.
  const fiveMB = 'x'.repeat(5 * 1024 * 1024);
  const result1 = estimateSessionSize([{ name: fiveMB, content: fiveMB }]);
  const result2 = estimateSessionSize([{ name: fiveMB, content: fiveMB }, { name: 'b.js', content: 'y' }]);
  // Both should return the same value since it short-circuits after exceeding cap
  assert.equal(result2, result1, 'adding files after cap should not change result');
});

test('estimateSessionSize handles files with unicode names and content', () => {
  const result = estimateSessionSize([
    { name: '\u4e2d\u6587.txt', content: '\u65e5\u672c\u8a9e' },
  ]);
  assert.ok(typeof result === 'number', 'result should be a number');
  assert.ok(result > 300, 'should be larger than empty base');
});

test('estimateSessionSize handles files with special characters in name', () => {
  const result = estimateSessionSize([
    { name: 'file-with-dashes_underscores.dots.js', content: 'content' },
  ]);
  assert.ok(result > 300, 'should include special char names in size');
});
