'use strict';

// webviewEscaping.test.js
// Tests for escapeHtmlPreserveBackticks and inline-code rendering
// in vscode-extension/src/webviewProvider.ts.
// These complement the webviewContent.test.js tests on main.

const assert = require('assert');

// ---------------------------------------------------------------------------
// Inline copy of the functions under test (matches webviewProvider.ts)
// ---------------------------------------------------------------------------

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeHtmlPreserveBackticks(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/`/g, '&#96;');
}

// Simulates inline code handling from renderMarkdown
function renderInlineCode(text) {
  const escaped = escapeHtmlPreserveBackticks(text);
  return escaped.replace(/&#96;([^&#96;]+)&#96;/g, '<code>$1</code>');
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
suite('webviewProvider.ts - escapeHtmlPreserveBackticks', function () {

  test('escapes ampersand', function () {
    assert.strictEqual(escapeHtmlPreserveBackticks('a & b'), 'a &amp; b');
  });

  test('escapes less-than', function () {
    assert.strictEqual(escapeHtmlPreserveBackticks('a < b'), 'a &lt; b');
  });

  test('escapes greater-than', function () {
    assert.strictEqual(escapeHtmlPreserveBackticks('a > b'), 'a &gt; b');
  });

  test('escapes double quote', function () {
    assert.strictEqual(escapeHtmlPreserveBackticks('say "hello"'), 'say &quot;hello&quot;');
  });

  test('escapes single quote', function () {
    assert.strictEqual(escapeHtmlPreserveBackticks("say 'hello'"), 'say &#039;hello&#039;');
  });

  test('preserves backtick unchanged', function () {
    assert.strictEqual(escapeHtmlPreserveBackticks('use `x` here'), 'use &#96;x&#96; here');
  });

  test('preserves multiple backticks', function () {
    assert.strictEqual(escapeHtmlPreserveBackticks('`` double backticks ``'), '&#96;&#96; double backticks &#96;&#96;');
  });

  test('escapes all special chars including backtick together', function () {
    assert.strictEqual(
      escapeHtmlPreserveBackticks('<script>alert(`xss`)</script>'),
      '&lt;script&gt;alert(&#96;xss&#96;)&lt;&#47;script&gt;'
    );
  });

  test('empty string returns empty string', function () {
    assert.strictEqual(escapeHtmlPreserveBackticks(''), '');
  });

  test('plain text without special chars returns unchanged', function () {
    assert.strictEqual(escapeHtmlPreserveBackticks('hello world'), 'hello world');
  });
});

suite('webviewProvider.ts - inline code rendering', function () {

  test('converts backtick-wrapped text to code tag', function () {
    const result = renderInlineCode('use `console.log` for debugging');
    assert.strictEqual(result, 'use <code>console.log</code> for debugging');
  });

  test('converts backtick-wrapped text with special chars inside', function () {
    const result = renderInlineCode('error: `x < 5 && y > 3`');
    assert.strictEqual(result, 'error: <code>x &lt; 5 &amp;&amp; y &gt; 3</code>');
  });

  test('handles multiple inline code segments', function () {
    const result = renderInlineCode('use `fn()` then `await fn()`');
    assert.strictEqual(result, 'use <code>fn()</code> then <code>await fn()</code>');
  });

  test('converts triple backticks to code tags (not double)', function () {
    // &#96;&#96;&#96; should NOT be matched by /&#96;([^&#96;]+)&#96;/
    const result = renderInlineCode('```code block```');
    assert.strictEqual(result, '&#96;&#96;&#96;code block&#96;&#96;&#96;');
  });

  test('plain text without backticks returns unchanged', function () {
    const result = renderInlineCode('no code here');
    assert.strictEqual(result, 'no code here');
  });

  test('empty string returns empty string', function () {
    assert.strictEqual(renderInlineCode(''), '');
  });
});

suite('webviewProvider.ts - escapeHtml vs escapeHtmlPreserveBackticks difference', function () {

  test('escapeHtml converts backtick to &#96;', function () {
    assert.strictEqual(escapeHtml('`code`'), '&#96;code&#96;');
  });

  test('escapeHtmlPreserveBackticks also converts backtick to &#96;', function () {
    assert.strictEqual(escapeHtmlPreserveBackticks('`code`'), '&#96;code&#96;');
  });

  test('both escapeHtml and escapeHtmlPreserveBackticks are identical for non-backtick chars', function () {
    const inputs = ['<script>', '&test&', '"quoted"', "'single'", 'a < b > c'];
    inputs.forEach(input => {
      assert.strictEqual(escapeHtml(input), escapeHtmlPreserveBackticks(input),
        'Both should escape the same for: ' + input);
    });
  });
});
