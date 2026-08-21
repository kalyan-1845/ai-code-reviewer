import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TMPDIR = os.tmpdir();

import { generateJSONReport, generateHTMLReport, generateSARIFReport, getReportPath, SCHEMA_VERSION } from '../utils/reportGenerator.js';

test('reportGenerator: SCHEMA_VERSION is exported and is a non-empty string', () => {
  assert.equal(typeof SCHEMA_VERSION, 'string');
  assert.ok(SCHEMA_VERSION.length > 0);
});

test('reportGenerator: getReportPath returns correct extension for json format', () => {
  const result = getReportPath('json', TMPDIR);
  assert.ok(result.endsWith('.json'), 'json format should return .json extension');
  assert.ok(result.includes(TMPDIR));
});

test('reportGenerator: getReportPath returns correct extension for html format', () => {
  const result = getReportPath('html', TMPDIR);
  assert.ok(result.endsWith('.html'), 'html format should return .html extension');
  assert.ok(result.includes(TMPDIR));
});

test('reportGenerator: getReportPath returns correct extension for sarif format', () => {
  const result = getReportPath('sarif', TMPDIR);
  assert.ok(result.endsWith('.sarif'), 'sarif format should return .sarif extension');
  assert.ok(result.includes(TMPDIR));
});

test('reportGenerator: getReportPath defaults to json when format is unknown', () => {
  const result = getReportPath('csv', '/tmp');
  assert.ok(result.endsWith('.json'), 'unknown format should default to .json');
});

test('reportGenerator: generateJSONReport writes valid JSON with correct schema', () => {
  const outputPath = path.join(TMPDIR, `test-json-${Date.now()}.json`);
  try {
    const repoName = 'test-repo';
    const files = [{ name: 'src/index.js' }];
    const reviewResult = {
      fileReviews: {
        'src/index.js': {
          bugs: [{ line: 10, description: 'Unused variable', rule: 'no-unused-vars' }],
          security: [{ line: 20, message: 'Hardcoded password', rule: 'no-passwords' }],
          optimization: [{ line: 30, description: 'Inefficient loop', rule: 'no-inner-loops' }],
          styling: [{ line: 40, message: 'Missing semicolon', rule: 'semi' }],
        },
      },
    };
    const result = generateJSONReport(repoName, files, reviewResult, outputPath);
    assert.equal(result.success, true);
    assert.equal(result.path, outputPath);
    assert.equal(result.findingCount, 4, 'should count bugs+security+optimization+styling = 4 findings');
    assert.ok(fs.existsSync(outputPath), 'file should be written');
    const written = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    assert.equal(written.schema_version, SCHEMA_VERSION);
    assert.equal(written.repository, repoName);
    assert.equal(written.files_reviewed, 1);
    assert.equal(written.total_findings, 4);
    assert.equal(written.by_severity.error, 2, 'bugs and security are error severity');
    assert.equal(written.by_severity.warning, 1, 'optimization is warning severity');
    assert.equal(written.by_severity.info, 1, 'styling is info severity');
    assert.ok(written.timestamp, 'should include a timestamp');
  } finally {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  }
});

test('reportGenerator: generateJSONReport returns success:false when write fails', () => {
  const filePath = path.join(TMPDIR, `test-file-dir-json-${Date.now()}.txt`);
  fs.writeFileSync(filePath, 'not a directory');
  try {
    const result = generateJSONReport('repo', [], null, path.join(filePath, 'fail.json'));
    assert.equal(result.success, false);
    assert.ok(result.error, 'should include error message');
  } finally {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
});

test('reportGenerator: generateJSONReport handles null reviewResult gracefully', () => {
  const outputPath = path.join(TMPDIR, `test-empty-${Date.now()}.json`);
  try {
    const result = generateJSONReport('empty-repo', [], null, outputPath);
    assert.equal(result.success, true);
    assert.equal(result.findingCount, 0, 'no findings for null reviewResult');
  } finally {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  }
});

test('reportGenerator: generateJSONReport handles fileReviews with no issues', () => {
  const outputPath = path.join(TMPDIR, `test-clean-${Date.now()}.json`);
  try {
    const result = generateJSONReport('clean-repo', [{ name: 'src/index.js' }], {
      fileReviews: { 'src/index.js': { bugs: [], security: [], optimization: [], styling: [] } },
    }, outputPath);
    assert.equal(result.success, true);
    assert.equal(result.findingCount, 0);
  } finally {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  }
});

test('reportGenerator: generateHTMLReport writes valid HTML with finding rows', () => {
  const outputPath = path.join(TMPDIR, `test-html-${Date.now()}.html`);
  try {
    const repoName = 'html-test-repo';
    const files = [{ name: 'src/app.js' }];
    const reviewResult = {
      fileReviews: {
        'src/app.js': {
          bugs: [{ line: 5, description: 'Bug here', rule: 'bug-rule' }],
          security: [],
          optimization: [],
          styling: [],
        },
      },
    };
    const result = generateHTMLReport(repoName, files, reviewResult, outputPath);
    assert.equal(result.success, true);
    assert.equal(result.path, outputPath);
    assert.ok(fs.existsSync(outputPath), 'file should be written');
    const html = fs.readFileSync(outputPath, 'utf-8');
    assert.ok(html.includes('<!DOCTYPE html>'), 'should be valid HTML5');
    assert.ok(html.includes('html-test-repo'), 'should include repo name');
    assert.ok(html.includes('src/app.js'), 'should include file path');
    assert.ok(html.includes('Bug here'), 'should include finding message');
  } finally {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  }
});

test('reportGenerator: generateHTMLReport handles custom or unknown severities in sorting without throwing', () => {
  const outputPath = path.join(TMPDIR, `test-custom-severity-${Date.now()}.html`);
  try {
    const repoName = 'custom-severity-repo';
    const files = [{ name: 'src/app.js' }];
    const result = generateHTMLReport(repoName, files, {
      fileReviews: {
        'src/app.js': {
          bugs: [
            { line: 5, description: 'Normal bug', rule: 'bug-rule' },
            { line: 6, description: 'Unknown severity bug', rule: 'custom-rule', severity: 'critical' }
          ],
          security: [],
          optimization: [],
          styling: [],
        }
      }
    }, outputPath);
    assert.equal(result.success, true);
    assert.equal(result.findingCount, 2);
  } finally {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  }
});

test('reportGenerator: generateHTMLReport returns success:false when write fails', () => {
  const filePath = path.join(TMPDIR, `test-file-dir-html-${Date.now()}.txt`);
  fs.writeFileSync(filePath, 'not a directory');
  try {
    const result = generateHTMLReport('repo', [], null, path.join(filePath, 'fail.html'));
    assert.equal(result.success, false);
  } finally {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
});

test('reportGenerator: generateHTMLReport handles empty reviewResult with no findings', () => {
  const outputPath = path.join(TMPDIR, `test-empty-html-${Date.now()}.html`);
  try {
    const result = generateHTMLReport('empty-repo', [], null, outputPath);
    assert.equal(result.success, true);
    assert.equal(result.findingCount, 0);
    const html = fs.readFileSync(outputPath, 'utf-8');
    assert.ok(html.includes('0'), 'empty count should appear in stats');
  } finally {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  }
});

test('reportGenerator: generateSARIFReport writes SARIF 2.1.0 with CWE and OWASP metadata', () => {
  const outputPath = path.join(TMPDIR, `test-sarif-${Date.now()}.sarif`);
  try {
    const reviewResult = {
      fileReviews: {
        'src/auth.js': {
          security: [
            { line: 12, description: 'Hardcoded API token', rule: 'hardcoded-token' },
            { line: 18, description: 'Unescaped script injection', rule_id: 'xss-output', cwe: 'CWE-79', owasp: 'A03:2021' },
          ],
        },
      },
    };

    const result = generateSARIFReport('repo', ['src/auth.js'], reviewResult, outputPath);
    assert.equal(result.success, true);
    assert.equal(result.findingCount, 2);

    const sarif = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    assert.equal(sarif.version, '2.1.0');
    assert.equal(sarif.runs[0].results.length, 2);
    assert.equal(sarif.runs[0].results[0].properties.cwe, 'CWE-798');
    assert.equal(sarif.runs[0].results[0].properties.owasp, 'A07:2021');
    assert.deepEqual(sarif.runs[0].tool.driver.rules[1].properties.tags, ['CWE-79', 'A03:2021']);
    assert.equal(sarif.runs[0].results[1].locations[0].physicalLocation.region.startLine, 18);
  } finally {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  }
});

test('reportGenerator: generateSARIFReport handles write failures', () => {
  const filePath = path.join(TMPDIR, `test-file-dir-sarif-${Date.now()}.txt`);
  fs.writeFileSync(filePath, 'not a directory');
  try {
    const result = generateSARIFReport('repo', [], null, path.join(filePath, 'fail.sarif'));
    assert.equal(result.success, false);
    assert.ok(result.error);
  } finally {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
});

test('reportGenerator: supports both rule and rule_id properties in input findings', () => {
  const outputPathJson = path.join(TMPDIR, `test-rules-json-${Date.now()}.json`);
  const outputPathHtml = path.join(TMPDIR, `test-rules-html-${Date.now()}.html`);
  const reviewResult = {
    fileReviews: {
      'src/file.js': {
        bugs: [
          { line: 5, rule_id: 'my-custom-bug-rule', description: 'Some bug' },
          { line: 10, rule: 'legacy-bug-rule', message: 'Legacy bug' }
        ]
      }
    }
  };

  try {
    const jsonRes = generateJSONReport('repo', ['src/file.js'], reviewResult, outputPathJson);
    assert.equal(jsonRes.success, true);
    const data = JSON.parse(fs.readFileSync(outputPathJson, 'utf-8'));
    assert.equal(data.findings[0].rule_id, 'my-custom-bug-rule');
    assert.equal(data.findings[1].rule_id, 'legacy-bug-rule');

    const htmlRes = generateHTMLReport('repo', ['src/file.js'], reviewResult, outputPathHtml);
    assert.equal(htmlRes.success, true);
    const html = fs.readFileSync(outputPathHtml, 'utf-8');
    assert.ok(html.includes('my-custom-bug-rule'));
    assert.ok(html.includes('legacy-bug-rule'));
  } finally {
    if (fs.existsSync(outputPathJson)) fs.unlinkSync(outputPathJson);
    if (fs.existsSync(outputPathHtml)) fs.unlinkSync(outputPathHtml);
  }
});

test('reportGenerator: getReportPath handles malicious formats gracefully against traversal', () => {
  const result = getReportPath('../malicious', 'dir');
  assert.equal(result, path.join('dir', 'review-report.json'));
});

test('reportGenerator: generateHTMLReport handles empty results gracefully with text', () => {
  const outputPath = path.join(TMPDIR, `test-empty-html2-${Date.now()}.html`);
  try {
    const result = generateHTMLReport('empty-repo', [], null, outputPath);
    assert.equal(result.success, true);
    const htmlContent = fs.readFileSync(outputPath, 'utf-8');
    assert.ok(htmlContent.includes('No findings detected!'));
  } finally {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  }
});
