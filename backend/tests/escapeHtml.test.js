import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from '../utils/reportGenerator.js';

test('escapeHtml escapes ampersand to &amp;', () => {
  assert.equal(escapeHtml('a & b'), 'a &amp; b');
});

test('escapeHtml escapes less-than to &lt;', () => {
  assert.equal(escapeHtml('<div>'), '&lt;div&gt;');
});

test('escapeHtml escapes greater-than to &gt;', () => {
  assert.equal(escapeHtml('5 > 3'), '5 &gt; 3');
});

test('escapeHtml escapes double-quote to &quot;', () => {
  assert.equal(escapeHtml('say "hello"'), 'say &quot;hello&quot;');
});

test('escapeHtml escapes single-quote to &#39;', () => {
  assert.equal(escapeHtml("it's"), 'it&#39;s');
});

test('escapeHtml escapes all HTML special characters together', () => {
  assert.equal(
    escapeHtml('<script>alert("XSS")</script>'),
    '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'
  );
});

test('escapeHtml returns empty string for null', () => {
  assert.equal(escapeHtml(null), '');
});

test('escapeHtml returns empty string for undefined', () => {
  assert.equal(escapeHtml(undefined), '');
});

test('escapeHtml returns empty string for number input', () => {
  assert.equal(escapeHtml(42), '');
  assert.equal(escapeHtml(0), '');
  assert.equal(escapeHtml(3.14), '');
});

test('escapeHtml returns empty string for object input', () => {
  assert.equal(escapeHtml({}), '');
  assert.equal(escapeHtml({ key: 'value' }), '');
});

test('escapeHtml returns empty string for array input', () => {
  assert.equal(escapeHtml([]), '');
  assert.equal(escapeHtml(['a', 'b']), '');
});

test('escapeHtml double-escapes already-escaped content (no idempotency)', () => {
  // escapeHtml is NOT idempotent - it will escape & again.
  const escaped = escapeHtml('<div>');
  assert.equal(escaped, '&lt;div&gt;');
  // Applying escapeHtml again escapes the & in &lt;
  const doubleEscaped = escapeHtml(escaped);
  assert.equal(doubleEscaped, '&amp;lt;div&amp;gt;');
});

test('escapeHtml passes unicode characters through unchanged', () => {
  assert.equal(escapeHtml('hello'), 'hello');
  assert.equal(escapeHtml('\u4e2d\u6587'), '\u4e2d\u6587');
  assert.equal(escapeHtml('\u00e9\u00e8\u00ea'), '\u00e9\u00e8\u00ea');
  assert.equal(escapeHtml('\u2764'), '\u2764'); // heart emoji
});

test('escapeHtml handles empty string', () => {
  assert.equal(escapeHtml(''), '');
});

test('escapeHtml handles whitespace-only strings', () => {
  assert.equal(escapeHtml('   '), '   ');
  assert.equal(escapeHtml('\t\n'), '\t\n');
});

test('escapeHtml handles strings with no special characters', () => {
  assert.equal(escapeHtml('hello world 123'), 'hello world 123');
  assert.equal(escapeHtml('abc_def-ghi'), 'abc_def-ghi');
});

test('escapeHtml handles mixed safe and unsafe characters', () => {
  assert.equal(escapeHtml('use <script> in <b>bold</b>'), 'use &lt;script&gt; in &lt;b&gt;bold&lt;/b&gt;');
});

test('escapeHtml handles consecutive special characters', () => {
  assert.equal(escapeHtml('<<<>>>'), '&lt;&lt;&lt;&gt;&gt;&gt;');
  assert.equal(escapeHtml('"""""'), '&quot;&quot;&quot;&quot;&quot;');
});

test('escapeHtml handles newlines and tabs', () => {
  assert.equal(escapeHtml('line1\nline2'), 'line1\nline2');
  assert.equal(escapeHtml('col1\tcol2'), 'col1\tcol2');
});

test('escapeHtml handles backticks and backslashes', () => {
  // Backslashes are not special HTML chars, pass through unchanged
  assert.equal(escapeHtml('path\\to\\file'), 'path\\to\\file');
  // Backticks are not escaped by escapeHtml (only &<>'" are escaped)
  assert.equal(escapeHtml('`code`'), '`code`');
});
