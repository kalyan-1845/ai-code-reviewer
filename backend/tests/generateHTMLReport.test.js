import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';

const _origWriteFileSync = fs.writeFileSync.bind(fs);
let lastWrittenContent = '';
let lastWrittenPath = '';
let shouldFail = false;

test.afterEach(() => {
  lastWrittenContent = '';
  lastWrittenPath = '';
  shouldFail = false;
});

// Patch before importing the module so the binding picks up the override
const _wrappedWriteFileSync = (filePath, content, encoding) => {
  if (shouldFail) {
    const err = new Error('Simulated write failure');
    err.code = 'ENOENT';
    throw err;
  }
  lastWrittenPath = filePath;
  lastWrittenContent = content;
  // do not actually write to disk
};
fs.writeFileSync = _wrappedWriteFileSync;

const { generateHTMLReport } = await import('../utils/reportGenerator.js');

const SAMPLE_REVIEW_RESULT = {
  fileReviews: {
    'src/utils/helper.js': {
      bugs: [{ line: 10, description: 'Unused variable', rule: 'no-unused-vars' }],
      security: [],
      optimization: [{ line: 25, description: 'Nested callback', rule: 'max-depth' }],
      styling: [],
    },
  },
};

test('generateHTMLReport returns success:true for valid inputs', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-test-'));
  const outputPath = path.join(tmpDir, 'report.html');
  const result = generateHTMLReport('my-repo', ['src/utils/helper.js'], SAMPLE_REVIEW_RESULT, outputPath);
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.path, outputPath);
  assert.ok(typeof result.findingCount === 'number');
  assert.ok(lastWrittenContent.length > 0);
  fs.rmSync(tmpDir, { recursive: true });
});

test('generateHTMLReport includes repoName in the HTML', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-test-'));
  const outputPath = path.join(tmpDir, 'report.html');
  generateHTMLReport('my-cool-repo', ['src/index.js'], { fileReviews: {} }, outputPath);
  assert.ok(lastWrittenContent.includes('my-cool-repo'));
  assert.ok(lastWrittenContent.includes('Code Review Report'));
  fs.rmSync(tmpDir, { recursive: true });
});

test('generateHTMLReport reflects finding counts in HTML', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-test-'));
  const outputPath = path.join(tmpDir, 'report.html');
  generateHTMLReport('test-repo', ['src/helper.js'], SAMPLE_REVIEW_RESULT, outputPath);
  // 1 bug + 1 optimization = 2 total findings
  assert.ok(lastWrittenContent.includes('>2<'));
  assert.ok(lastWrittenContent.includes('>1<') && lastWrittenContent.includes('Errors'));
  fs.rmSync(tmpDir, { recursive: true });
});

test('generateHTMLReport renders empty fileReviews without crashing', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-test-'));
  const outputPath = path.join(tmpDir, 'report.html');
  const result = generateHTMLReport('empty-repo', [], { fileReviews: {} }, outputPath);
  assert.strictEqual(result.success, true);
  assert.ok(lastWrittenContent.includes('No findings detected'));
  fs.rmSync(tmpDir, { recursive: true });
});

test('generateHTMLReport returns success:false when write fails', () => {
  shouldFail = true;
  const nonexistentPath = path.join(os.tmpdir(), 'does-not-exist-xyz789', 'report.html');
  const result = generateHTMLReport('test-repo', [], { fileReviews: {} }, nonexistentPath);
  assert.strictEqual(result.success, false);
  assert.ok(typeof result.error === 'string');
});

test('generateHTMLReport includes filesReviewed count in meta', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-test-'));
  const outputPath = path.join(tmpDir, 'report.html');
  generateHTMLReport('meta-repo', ['file1.js', 'file2.js', 'file3.js'], { fileReviews: {} }, outputPath);
  assert.ok(lastWrittenContent.includes('Files Reviewed'));
  assert.ok(lastWrittenContent.includes('Files Reviewed:</strong> 3')); // files count rendered
  fs.rmSync(tmpDir, { recursive: true });
});

test('generateHTMLReport escapes HTML in repoName and messages', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-test-'));
  const outputPath = path.join(tmpDir, 'report.html');
  const reviewWithXss = {
    fileReviews: {
      '<script>alert("xss")</script>': {
        bugs: [{ line: 1, description: 'XSS <img src=x onerror=alert(1)>', rule: 'xss' }],
        security: [],
        optimization: [],
        styling: [],
      },
    },
  };
  generateHTMLReport('<img src=x onerror=alert(1)>', ['<script>file.js</script>'], reviewWithXss, outputPath);
  assert.ok(!lastWrittenContent.includes('<script>alert'));
  assert.ok(lastWrittenContent.includes('&lt;script&gt;'));
  fs.rmSync(tmpDir, { recursive: true });
});
