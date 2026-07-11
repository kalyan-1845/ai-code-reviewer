import * as assert from 'assert';
import { escapeHtml, renderMarkdown } from '../../webviewProvider';

suite('webviewProvider helpers', () => {
  // ----- escapeHtml -----

  test('escapeHtml escapes ampersand', () => {
    assert.equal(escapeHtml('a & b'), 'a &amp; b');
  });

  test('escapeHtml escapes less-than', () => {
    assert.equal(escapeHtml('<div>'), '&lt;div&gt;');
  });

  test('escapeHtml escapes greater-than', () => {
    assert.equal(escapeHtml('3 > 1'), '3 &gt; 1');
  });

  test('escapeHtml escapes double quote', () => {
    assert.equal(escapeHtml('say "hello"'), 'say &quot;hello&quot;');
  });

  test('escapeHtml escapes multiple special chars', () => {
    assert.equal(
      escapeHtml('<script>alert("xss")</script>'),
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  test('escapeHtml returns unchanged string when no special chars', () => {
    assert.equal(escapeHtml('hello world'), 'hello world');
  });

  test('escapeHtml handles empty string', () => {
    assert.equal(escapeHtml(''), '');
  });

  // ----- renderMarkdown -----

  test('renderMarkdown renders h1', () => {
    const html = renderMarkdown('# Hello World');
    assert.ok(html.includes('<h1>Hello World</h1>'), `Expected h1, got: ${html}`);
  });

  test('renderMarkdown renders h2', () => {
    const html = renderMarkdown('## Section Two');
    assert.ok(html.includes('<h2>Section Two</h2>'), `Expected h2, got: ${html}`);
  });

  test('renderMarkdown renders h3', () => {
    const html = renderMarkdown('### Sub heading');
    assert.ok(html.includes('<h3>Sub heading</h3>'), `Expected h3, got: ${html}`);
  });

  test('renderMarkdown renders unordered list', () => {
    const html = renderMarkdown('- item one\n- item two');
    assert.ok(html.includes('<li>item one</li>'), `Expected list item, got: ${html}`);
    assert.ok(html.includes('<li>item two</li>'), `Expected list item, got: ${html}`);
  });

  test('renderMarkdown renders inline code', () => {
    const html = renderMarkdown('use `console.log()` here');
    assert.ok(html.includes('<code>console.log()</code>'), `Expected inline code, got: ${html}`);
  });

  test('renderMarkdown escapes inline code content', () => {
    const html = renderMarkdown('use `<div>` here');
    assert.ok(html.includes('&lt;div&gt;'), `Expected escaped div, got: ${html}`);
  });

  test('renderMarkdown renders code block', () => {
    const html = renderMarkdown('```\nconst x = 1;\n```');
    assert.ok(html.includes('<pre><code>'), `Expected code block, got: ${html}`);
    assert.ok(html.includes('const x = 1;'), `Expected code content, got: ${html}`);
  });

  test('renderMarkdown escapes code block content', () => {
    const html = renderMarkdown('```\nconst x = "<p>";\n```');
    assert.ok(html.includes('&lt;p&gt;'), `Expected escaped HTML in code block, got: ${html}`);
  });

  test('renderMarkdown renders plain paragraph', () => {
    const html = renderMarkdown('This is plain text.');
    assert.ok(html.includes('<p>This is plain text.</p>'), `Expected paragraph, got: ${html}`);
  });

  test('renderMarkdown adds spacer between blank lines', () => {
    const html = renderMarkdown('line one\n\nline two');
    assert.ok(html.includes('<div class="spacer"></div>'), `Expected spacer div, got: ${html}`);
  });

  test('renderMarkdown handles empty string', () => {
    const html = renderMarkdown('');
    // An empty string splits to [''], which matches the blank-line branch,
    // producing a single spacer div rather than an empty string.
    assert.equal(html, '<div class="spacer"></div>');
  });

  test('renderMarkdown handles multiline mixed content', () => {
    const html = renderMarkdown('# Title\n\nParagraph here.\n\n- list item');
    assert.ok(html.includes('<h1>Title</h1>'));
    assert.ok(html.includes('<p>Paragraph here.</p>'));
    assert.ok(html.includes('<li>list item</li>'));
  });

  test('renderMarkdown strips language tag from code fence', () => {
    const html = renderMarkdown('```javascript\nconst y = 2;\n```');
    assert.ok(html.includes('<pre><code>'), 'should include code block');
    assert.ok(!html.includes('javascript'), 'language tag should not appear in output');
  });
});
