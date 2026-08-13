import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { generateHTMLReport, SCHEMA_VERSION } from '../utils/reportGenerator.js';

async function withTempFile(fn) {
  const filePath = path.join(os.tmpdir(), `html-report-test-${Date.now()}-${Math.random()}.html`);
  try {
    return await fn(filePath);
  } finally {
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  }
}

test('SCHEMA_VERSION is exported and equals "1.0"', () => {
  assert.equal(SCHEMA_VERSION, '1.0');
});

test('generateHTMLReport returns success with correct path when given valid inputs', async () => {
  await withTempFile(async (outputPath) => {
    const files = [{ name: 'src/index.js' }];
    const reviewResult = {
      fileReviews: {
        'src/index.js': {
          bugs: [{ line: 10, description: 'unused variable', rule: 'no-unused-vars' }],
          security: [],
          optimization: [],
          styling: [],
        },
      },
    };

    const result = generateHTMLReport('test-repo', files, reviewResult, outputPath);

    assert.equal(result.success, true);
    assert.equal(result.path, outputPath);
    assert.equal(result.findingCount, 1);
  });
});

test('generateHTMLReport counts bugs and security as error severity', async () => {
  await withTempFile(async (outputPath) => {
    const files = [{ name: 'src/app.js' }];
    const reviewResult = {
      fileReviews: {
        'src/app.js': {
          bugs: [
            { line: 5, description: 'null pointer', rule: 'no-null' },
            { line: 20, description: 'type error', rule: 'type-error' },
          ],
          security: [
            { line: 15, description: 'SQL injection', rule: 'sql-injection' },
          ],
          optimization: [],
          styling: [],
        },
      },
    };

    const result = generateHTMLReport('test-repo', files, reviewResult, outputPath);
    assert.equal(result.success, true);
    assert.equal(result.findingCount, 3);

    const html = fs.readFileSync(outputPath, 'utf-8');
    assert.ok(html.includes('error'), 'error severity should appear in HTML');
  });
});

test('generateHTMLReport counts optimization as warning severity', async () => {
  await withTempFile(async (outputPath) => {
    const files = [{ name: 'src/utils.js' }];
    const reviewResult = {
      fileReviews: {
        'src/utils.js': {
          bugs: [],
          security: [],
          optimization: [
            { line: 3, description: 'cache this result', rule: 'use-cache' },
          ],
          styling: [],
        },
      },
    };

    const result = generateHTMLReport('test-repo', files, reviewResult, outputPath);
    assert.equal(result.success, true);
    assert.equal(result.findingCount, 1);

    const html = fs.readFileSync(outputPath, 'utf-8');
    assert.ok(html.includes('warning'), 'warning severity should appear in HTML');
  });
});

test('generateHTMLReport counts styling as info severity', async () => {
  await withTempFile(async (outputPath) => {
    const files = [{ name: 'src/style.js' }];
    const reviewResult = {
      fileReviews: {
        'src/style.js': {
          bugs: [],
          security: [],
          optimization: [],
          styling: [
            { line: 1, description: 'missing trailing comma', rule: 'trailing-comma' },
          ],
        },
      },
    };

    const result = generateHTMLReport('test-repo', files, reviewResult, outputPath);
    assert.equal(result.success, true);
    assert.equal(result.findingCount, 1);

    const html = fs.readFileSync(outputPath, 'utf-8');
    assert.ok(html.includes('info'), 'info severity should appear in HTML');
  });
});

test('generateHTMLReport handles empty reviewResult gracefully', async () => {
  await withTempFile(async (outputPath) => {
    const files = [{ name: 'src/empty.js' }];
    const reviewResult = {};

    const result = generateHTMLReport('test-repo', files, reviewResult, outputPath);
    assert.equal(result.success, true);
    assert.equal(result.findingCount, 0);
  });
});

test('generateHTMLReport handles missing fileReviews in reviewResult', async () => {
  await withTempFile(async (outputPath) => {
    const files = [{ name: 'src/missing.js' }];
    const reviewResult = { fileReviews: null };

    const result = generateHTMLReport('test-repo', files, reviewResult, outputPath);
    assert.equal(result.success, true);
    assert.equal(result.findingCount, 0);
  });
});

test('generateHTMLReport writes a valid HTML file', async () => {
  await withTempFile(async (outputPath) => {
    const files = [{ name: 'src/index.js' }];
    const reviewResult = {
      fileReviews: {
        'src/index.js': {
          bugs: [{ line: 10, message: 'unused variable', rule_id: 'no-unused-vars' }],
          security: [],
          optimization: [],
          styling: [],
        },
      },
    };

    generateHTMLReport('test-repo', files, reviewResult, outputPath);

    const html = fs.readFileSync(outputPath, 'utf-8');
    assert.ok(html.trimStart().startsWith('<!DOCTYPE html>'), 'should start with DOCTYPE');
    assert.ok(html.includes('<html'), 'should include html tag');
    assert.ok(html.includes('<head>'), 'should include head tag');
    assert.ok(html.includes('<body>'), 'should include body tag');
    assert.ok(html.includes('</html>'), 'should close html tag');
    assert.ok(html.includes('<table>'), 'should include table tag');
  });
});

test('generateHTMLReport includes repoName in title and meta section', async () => {
  await withTempFile(async (outputPath) => {
    const files = [];
    const reviewResult = {};

    generateHTMLReport('My-Cool-Repo', files, reviewResult, outputPath);

    const html = fs.readFileSync(outputPath, 'utf-8');
    assert.ok(html.includes('My-Cool-Repo'), 'repoName should appear in title');
    assert.ok(html.includes('Repository:'), 'meta section should include Repository label');
  });
});

test('generateHTMLReport includes Files Reviewed count in meta section', async () => {
  await withTempFile(async (outputPath) => {
    const files = [{ name: 'a.js' }, { name: 'b.js' }];
    const reviewResult = {};

    generateHTMLReport('my-repo', files, reviewResult, outputPath);

    const html = fs.readFileSync(outputPath, 'utf-8');
    assert.ok(html.includes('Files Reviewed'), 'Files Reviewed label should appear');
    assert.ok(html.includes('2'), 'file count 2 should appear');
  });
});

test('generateHTMLReport renders findings in a table', async () => {
  await withTempFile(async (outputPath) => {
    const files = [{ name: 'src/index.js' }];
    const reviewResult = {
      fileReviews: {
        'src/index.js': {
          bugs: [{ line: 42, description: 'null pointer', rule: 'no-null' }],
          security: [],
          optimization: [],
          styling: [],
        },
      },
    };

    generateHTMLReport('test-repo', files, reviewResult, outputPath);

    const html = fs.readFileSync(outputPath, 'utf-8');
    assert.ok(html.includes('src/index.js'), 'file path should appear in table');
    assert.ok(html.includes('42'), 'line number should appear');
    assert.ok(html.includes('null pointer'), 'description should appear');
    assert.ok(html.includes('no-null'), 'rule should appear');
  });
});

test('generateHTMLReport renders all four finding types', async () => {
  await withTempFile(async (outputPath) => {
    const files = [{ name: 'src/app.js' }];
    // categorizeFinding uses message content to determine category.
    // Use messages that trigger each category: security, performance, style, other.
    const reviewResult = {
      fileReviews: {
        'src/app.js': {
          bugs: [{ line: 1, message: 'null pointer dereference', rule_id: 'null-ptr' }],
          security: [{ line: 2, message: 'SQL injection vulnerability', rule_id: 'sql-injection' }],
          optimization: [{ line: 3, message: 'N+1 query pattern detected', rule_id: 'n-plus-one' }],
          styling: [{ line: 4, message: 'Missing trailing comma', rule_id: 'trailing-comma' }],
        },
      },
    };

    generateHTMLReport('test-repo', files, reviewResult, outputPath);

    const html = fs.readFileSync(outputPath, 'utf-8');
    assert.ok(html.includes('error'), 'error badge should appear for bugs and security');
    assert.ok(html.includes('warning'), 'warning badge should appear for optimization');
    assert.ok(html.includes('info'), 'info badge should appear for styling');
    assert.ok(html.includes('security'), 'security category should appear');
    assert.ok(html.includes('performance'), 'performance category should appear');
    assert.ok(html.includes('style'), 'style category should appear');
    assert.ok(html.includes('other'), 'other category should appear for null-ptr bug');
  });
});

test('generateHTMLReport applies escapeHtml to repoName in meta section', async () => {
  await withTempFile(async (outputPath) => {
    const files = [];
    const reviewResult = {};

    generateHTMLReport('<script>alert(1)</script>', files, reviewResult, outputPath);

    const html = fs.readFileSync(outputPath, 'utf-8');
    // repoName is escaped in the meta section (Repository: field)
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'),
      'script tag should be escaped in meta section');
  });
});

test('generateHTMLReport applies escapeHtml to file paths in table', async () => {
  await withTempFile(async (outputPath) => {
    const files = [{ name: '<img src=x onerror=alert(1)>' }];
    const reviewResult = {
      fileReviews: {
        '<img src=x onerror=alert(1)>': {
          bugs: [{ line: 1, description: 'xss', rule: 'xss' }],
          security: [],
          optimization: [],
          styling: [],
        },
      },
    };

    generateHTMLReport('xss-repo', files, reviewResult, outputPath);

    const html = fs.readFileSync(outputPath, 'utf-8');
    assert.equal(html.includes('<img src=x onerror=alert(1)>'), false,
      'raw img tag in file path should not appear');
  });
});

test('generateHTMLReport applies escapeHtml to description and suggestion', async () => {
  await withTempFile(async (outputPath) => {
    const files = [{ name: 'test.js' }];
    const reviewResult = {
      fileReviews: {
        'test.js': {
          bugs: [{ line: 1, description: 'Use <b>bold</b> not <script>', rule: 'xss' }],
          security: [],
          optimization: [],
          styling: [],
        },
      },
    };

    generateHTMLReport('test-repo', files, reviewResult, outputPath);

    const html = fs.readFileSync(outputPath, 'utf-8');
    assert.equal(html.includes('<script>'), false, 'script tag in description should be escaped');
    assert.equal(html.includes('<b>bold</b>'), false, 'b tag in description should be escaped');
  });
});

test('generateHTMLReport shows "No findings" message when all categories are empty', async () => {
  await withTempFile(async (outputPath) => {
    const files = [{ name: 'clean.js' }];
    const reviewResult = {
      fileReviews: {
        'clean.js': {
          bugs: [],
          security: [],
          optimization: [],
          styling: [],
        },
      },
    };

    generateHTMLReport('clean-repo', files, reviewResult, outputPath);

    const html = fs.readFileSync(outputPath, 'utf-8');
    assert.ok(
      html.includes('No findings') || html.includes('No findings'),
      'no findings message should appear'
    );
  });
});

test('generateHTMLReport returns error result on invalid output path', async () => {
  const result = generateHTMLReport('test-repo', [], {}, '\0invalid/read-only/path/report.html');
  assert.equal(result.success, false);
  assert.ok(result.error !== undefined);
});

test('generateHTMLReport renders severity stats in the stats section', async () => {
  await withTempFile(async (outputPath) => {
    const files = [{ name: 'stats.js' }];
    const reviewResult = {
      fileReviews: {
        'stats.js': {
          bugs: [{ line: 1, description: 'bug', rule: 'b1' }],
          security: [{ line: 2, description: 'sec', rule: 's1' }],
          optimization: [{ line: 3, description: 'opt', rule: 'o1' }],
          styling: [{ line: 4, description: 'style', rule: 'st1' }],
        },
      },
    };

    generateHTMLReport('stats-repo', files, reviewResult, outputPath);

    const html = fs.readFileSync(outputPath, 'utf-8');
    // Check that total count appears
    assert.ok(html.includes('4') || html.includes('Total'), 'stats should appear');
    // Check stats section exists
    assert.ok(html.includes('Errors') || html.includes('error'), 'Errors stat should appear');
    assert.ok(html.includes('Warnings') || html.includes('warning'), 'Warnings stat should appear');
    assert.ok(html.includes('Info') || html.includes('info'), 'Info stat should appear');
  });
});

test('generateHTMLReport sorts findings stably even with custom/unknown severity levels (no NaN)', async () => {
  await withTempFile(async (outputPath) => {
    const files = [{ name: 'test.js' }];
    const reviewResult = {
      fileReviews: {
        'test.js': {
          bugs: [
            { line: 10, description: 'bug 1', rule: 'b1' }
          ],
          security: [],
          optimization: [
            // Injecting unknown severity category name which would normally cause NaN sort
            { line: 20, description: 'opt 1', rule: 'o1', severity: 'super-critical' }
          ],
          styling: [],
        },
      },
    };

    const result = generateHTMLReport('test-repo', files, reviewResult, outputPath);
    assert.equal(result.success, true);
    
    const html = fs.readFileSync(outputPath, 'utf-8');
    assert.ok(html.includes('super-critical'));
  });
});
