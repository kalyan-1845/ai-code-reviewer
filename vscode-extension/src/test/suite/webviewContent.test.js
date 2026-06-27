'use strict';

// webviewContent.test.js
// Tests for getWebviewContent helper in vscode-extension/src/webviewProvider.ts.
// The function is not yet exported on main, so we include it directly here
// along with its helper dependencies (escapeHtml, renderMarkdown).
// These tests complement the escapeHtml/renderMarkdown tests from PR #726
// by testing the getWebviewContent composition logic.

const assert = require('assert');

// ---------------------------------------------------------------------------
// Inline helpers (copied from webviewProvider.ts for test isolation)
// ---------------------------------------------------------------------------

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderMarkdown(md) {
  const lines = md.split('\n');
  let html = '';
  let inCodeBlock = false;
  let codeBuffer = [];
  let codeLang = '';

  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      if (inCodeBlock) {
        const code = escapeHtml(codeBuffer.join('\n'));
        html += `<pre><code>${code}</code></pre>`;
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeLang = line.trimStart().slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    if (line.startsWith('# ')) {
      html += `<h1>${escapeHtml(line.slice(2))}</h1>`;
    } else if (line.startsWith('## ')) {
      html += `<h2>${escapeHtml(line.slice(3))}</h2>`;
    } else if (line.startsWith('### ')) {
      html += `<h3>${escapeHtml(line.slice(4))}</h3>`;
    } else if (line.trim().startsWith('- ')) {
      html += `<li>${escapeHtml(line.trim().slice(2))}</li>`;
    } else if (line.trim() === '') {
      html += `<div class="spacer"></div>`;
    } else {
      const formatted = escapeHtml(line).replace(
        /`([^`]+)`/g,
        '<code>$1</code>'
      );
      html += `<p>${formatted}</p>`;
    }
  }

  if (codeBuffer.length > 0) {
    const code = escapeHtml(codeBuffer.join('\n'));
    html += `<pre><code>${code}</code></pre>`;
  }

  return html;
}

function getWebviewContent(markdown, isLoading, error) {
  const bodyContent = error
    ? `<div class="error-message">${escapeHtml(error)}</div>`
    : isLoading
    ? `<div class="loading"><div class="spinner"></div><span>Reviewing your code...</span></div>`
    : markdown
    ? renderMarkdown(markdown)
    : `<div class="empty-state"><span class="empty-icon">🔍</span><p>Open a file and run <strong>RepoSage: Review Current File</strong> to see results here.</p></div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
:root {
  --bg: #1e1e1e;
  --card: #2d2d2d;
  --text: #d4d4d4;
  --heading: #e0e0e0;
  --accent: #569cd6;
  --code-bg: #1e1e1e;
  --code-text: #ce9178;
  --border: #3c3c3c;
  --error-bg: #3a1d1d;
  --error-text: #f48771;
  --error-border: #6b2a2a;
}
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  padding: 16px;
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-size: 13px;
  line-height: 1.6;
}
h1 { font-size: 16px; font-weight: 700; color: var(--heading); margin: 16px 0 8px 0; padding-bottom: 4px; border-bottom: 1px solid var(--border); }
h2 { font-size: 14px; font-weight: 600; color: var(--heading); margin: 12px 0 6px 0; }
h3 { font-size: 13px; font-weight: 600; color: var(--heading); margin: 10px 0 4px 0; }
p { margin: 0 0 6px 0; }
code {
  background: var(--code-bg);
  color: var(--code-text);
  padding: 1px 4px;
  border-radius: 3px;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  font-size: 12px;
}
pre {
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 12px;
  overflow-x: auto;
  margin: 8px 0;
}
pre code {
  background: none;
  padding: 0;
  color: var(--code-text);
  line-height: 1.5;
}
li { margin-left: 16px; margin-bottom: 4px; }
.spacer { height: 6px; }
.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  gap: 12px;
  color: var(--text);
}
.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.error-message {
  background: var(--error-bg);
  border: 1px solid var(--error-border);
  color: var(--error-text);
  padding: 12px;
  border-radius: 6px;
  font-size: 12px;
  margin: 8px 0;
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  text-align: center;
  color: #808080;
}
.empty-icon { font-size: 32px; margin-bottom: 12px; }
.empty-state p { font-size: 12px; line-height: 1.5; }
</style>
</head>
<body>${bodyContent}</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
suite('webviewProvider.ts - getWebviewContent', function () {

  test('with isLoading=true renders loading spinner and not the markdown', function () {
    const html = getWebviewContent('# Hello World', true, null);

    assert.ok(html.includes('<div class="loading">'), 'should include loading div');
    assert.ok(html.includes('<div class="spinner">'), 'should include spinner');
    assert.ok(html.includes('Reviewing your code...'), 'should show loading text');
    assert.ok(!html.includes('<h1>'), 'markdown h1 should not appear when loading');
  });

  test('with error!=null renders error-message div', function () {
    const html = getWebviewContent('', false, 'Something went wrong');

    assert.ok(html.includes('<div class="error-message">'), 'should include error div');
    assert.ok(html.includes('Something went wrong'), 'should show error text');
    assert.ok(!html.includes('<div class="loading">'), 'should not show loading when error');
    assert.ok(!html.includes('<div class="empty-state">'), 'should not show empty state when error');
  });

  test('with non-empty markdown renders the rendered content', function () {
    const html = getWebviewContent('# Security Review\n\n- Use HTTPS', false, null);

    assert.ok(html.includes('<h1>Security Review</h1>'), 'should render h1');
    assert.ok(html.includes('<li>Use HTTPS</li>'), 'should render list item');
    assert.ok(!html.includes('<div class="loading">'), 'should not show loading');
    assert.ok(!html.includes('<div class="empty-state">'), 'should not show empty state');
    assert.ok(!html.includes('<div class="error-message">'), 'should not show error');
  });

  test('with empty markdown and no error/loading renders empty-state', function () {
    const html = getWebviewContent('', false, null);

    assert.ok(html.includes('<div class="empty-state">'), 'should include empty state div');
    assert.ok(html.includes('🔍'), 'should show empty state icon');
    assert.ok(html.includes('RepoSage: Review Current File'), 'should show instructions');
    assert.ok(!html.includes('<div class="loading">'), 'should not show loading');
    assert.ok(!html.includes('<div class="error-message">'), 'should not show error');
  });

  test('output includes doctype, html, head, body tags', function () {
    const html = getWebviewContent('', false, null);

    assert.ok(html.startsWith('<!DOCTYPE html>'), 'should start with doctype');
    assert.ok(html.includes('<html'), 'should include html tag');
    assert.ok(html.includes('<head>'), 'should include head tag');
    assert.ok(html.includes('<body>'), 'should include body tag');
    assert.ok(html.includes('</html>'), 'should close html tag');
  });

  test('body tag contains the correct bodyContent', function () {
    const errorHtml = getWebviewContent('', false, 'Oops!');
    assert.ok(errorHtml.includes('<body><div class="error-message">'),
      'error bodyContent should be in body');

    const loadingHtml = getWebviewContent('# Hi', true, null);
    assert.ok(loadingHtml.includes('<body><div class="loading">'),
      'loading bodyContent should be in body');

    const markdownHtml = getWebviewContent('# Test', false, null);
    assert.ok(markdownHtml.includes('<body><h1>'),
      'markdown bodyContent should be in body');

    const emptyHtml = getWebviewContent('', false, null);
    assert.ok(emptyHtml.includes('<body><div class="empty-state">'),
      'empty state bodyContent should be in body');
  });

  test('error text is HTML-escaped', function () {
    const html = getWebviewContent('', false, '<script>alert(1)</script>');

    assert.ok(!html.includes('<script>alert(1)</script>'),
      'raw script tag should not appear in error');
    assert.ok(html.includes('&lt;script&gt;'),
      'script tag should be escaped in error message');
  });

  test('markdown content is HTML-escaped via renderMarkdown', function () {
    const html = getWebviewContent('<img src=x onerror=alert(1)>', false, null);

    // The markdown content should be escaped
    assert.ok(!html.includes('<img src=x onerror=alert'),
      'raw XSS in markdown should not appear unescaped');
  });

  test('error takes priority over loading when both are set', function () {
    // error is checked first in the conditional chain
    const html = getWebviewContent('', true, 'Error text');

    assert.ok(html.includes('<div class="error-message">'),
      'error should be shown even when isLoading=true');
    assert.ok(html.includes('Error text'));
    assert.ok(!html.includes('<div class="loading">'),
      'loading should not appear when error is set');
  });

  test('markdown takes priority over empty state when markdown is non-empty', function () {
    const html = getWebviewContent('# Title', false, null);

    assert.ok(html.includes('<h1>Title</h1>'), 'markdown should be rendered');
    assert.ok(!html.includes('<div class="empty-state">'),
      'empty state should not appear when markdown is provided');
  });
});
