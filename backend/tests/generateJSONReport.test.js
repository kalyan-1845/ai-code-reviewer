import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { generateJSONReport, SCHEMA_VERSION } from '../utils/reportGenerator.js';

async function withTempFile(fn) {
  const fd = await new Promise((resolve, reject) => {
    fs.open(path.join(os.tmpdir(), `report-test-${Date.now()}.json`), 'w+', (err, fd) => {
      if (err) reject(err);
      else resolve(fd);
    });
  });
  const filePath = path.join(os.tmpdir(), `report-test-${Date.now()}.json`);
  try {
    return await fn(filePath);
  } finally {
    try { fs.unlinkSync(filePath); } catch { /* ignore */ }
  }
}

test('SCHEMA_VERSION is exported and equals "1.0"', () => {
  assert.equal(SCHEMA_VERSION, '1.0');
});

test('generateJSONReport returns success with correct path when given valid inputs', async () => {
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

    const result = generateJSONReport('test-repo', files, reviewResult, outputPath);

    assert.equal(result.success, true);
    assert.equal(result.path, outputPath);
    assert.equal(result.findingCount, 1);
  });
});

test('generateJSONReport counts bugs and security as error severity', async () => {
  await withTempFile(async (outputPath) => {
    const files = [{ name: 'src/app.js' }];
    const reviewResult = {
      fileReviews: {
        'src/app.js': {
          bugs: [
            { line: 5, description: 'null pointer access', rule: 'no-null' },
            { line: 20, description: 'type error', rule: 'type-error' },
          ],
          security: [
            { line: 15, description: 'SQL injection risk', rule: 'sql-injection' },
          ],
          optimization: [],
          styling: [],
        },
      },
    };

    const result = generateJSONReport('test-repo', files, reviewResult, outputPath);
    assert.equal(result.success, true);
    assert.equal(result.findingCount, 3);

    const report = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    assert.equal(report.by_severity.error, 3);
    assert.equal(report.by_severity.warning, 0);
    assert.equal(report.by_severity.info, 0);
  });
});

test('generateJSONReport counts optimization as warning severity', async () => {
  await withTempFile(async (outputPath) => {
    const files = [{ name: 'src/utils.js' }];
    const reviewResult = {
      fileReviews: {
        'src/utils.js': {
          bugs: [],
          security: [],
          optimization: [
            { line: 3, description: 'cache this result', rule: 'use-cache' },
            { line: 7, description: 'n+1 query pattern', rule: 'n-plus-one' },
          ],
          styling: [],
        },
      },
    };

    const result = generateJSONReport('test-repo', files, reviewResult, outputPath);
    assert.equal(result.success, true);
    assert.equal(result.findingCount, 2);

    const report = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    assert.equal(report.by_severity.warning, 2);
    assert.equal(report.by_severity.error, 0);
  });
});

test('generateJSONReport counts styling as info severity', async () => {
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

    const result = generateJSONReport('test-repo', files, reviewResult, outputPath);
    assert.equal(result.success, true);
    assert.equal(result.findingCount, 1);

    const report = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    assert.equal(report.by_severity.info, 1);
  });
});

test('generateJSONReport handles empty reviewResult gracefully', async () => {
  await withTempFile(async (outputPath) => {
    const files = [{ name: 'src/empty.js' }];
    const reviewResult = {};

    const result = generateJSONReport('test-repo', files, reviewResult, outputPath);
    assert.equal(result.success, true);
    assert.equal(result.findingCount, 0);

    const report = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    assert.equal(report.total_findings, 0);
    assert.equal(report.by_severity.error, 0);
    assert.equal(report.by_severity.warning, 0);
    assert.equal(report.by_severity.info, 0);
  });
});

test('generateJSONReport handles missing fileReviews in reviewResult', async () => {
  await withTempFile(async (outputPath) => {
    const files = [{ name: 'src/missing.js' }];
    const reviewResult = { fileReviews: null };

    const result = generateJSONReport('test-repo', files, reviewResult, outputPath);
    assert.equal(result.success, true);
    assert.equal(result.findingCount, 0);
  });
});

test('generateJSONReport returns error result on invalid output path', async () => {
  const result = generateJSONReport('test-repo', [], {}, '/invalid/read-only/path/report.json');
  assert.equal(result.success, false);
  assert.ok(result.error !== undefined);
});

test('generateJSONReport produces valid JSON with all required top-level fields', async () => {
  await withTempFile(async (outputPath) => {
    const files = [{ name: 'src/valid.js' }];
    const reviewResult = {
      fileReviews: {
        'src/valid.js': {
          bugs: [{ line: 1, description: 'bug here', rule: 'bug-rule' }],
          security: [],
          optimization: [],
          styling: [],
        },
      },
    };

    const result = generateJSONReport('test-repo', files, reviewResult, outputPath);
    assert.equal(result.success, true);

    const report = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    assert.ok('schema_version' in report);
    assert.ok('timestamp' in report);
    assert.ok('repository' in report);
    assert.ok('files_reviewed' in report);
    assert.ok('total_findings' in report);
    assert.ok('by_severity' in report);
    assert.ok('by_category' in report);
    assert.ok('findings' in report);

    assert.equal(report.schema_version, '1.0');
    assert.equal(report.repository, 'test-repo');
    assert.equal(report.files_reviewed, 1);
    assert.equal(report.total_findings, 1);
    assert.ok(Array.isArray(report.findings));
  });
});

test('generateJSONReport uses issue.description for message when available', async () => {
  await withTempFile(async (outputPath) => {
    const files = [{ name: 'src/desc.js' }];
    const reviewResult = {
      fileReviews: {
        'src/desc.js': {
          bugs: [{ line: 5, description: 'the actual description', rule: 'test-rule' }],
          security: [],
          optimization: [],
          styling: [],
        },
      },
    };

    const result = generateJSONReport('test-repo', files, reviewResult, outputPath);
    assert.equal(result.success, true);

    const report = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    assert.equal(report.findings[0].message, 'the actual description');
  });
});

test('generateJSONReport falls back to issue.message when description is absent', async () => {
  await withTempFile(async (outputPath) => {
    const files = [{ name: 'src/msg.js' }];
    const reviewResult = {
      fileReviews: {
        'src/msg.js': {
          bugs: [{ line: 5, message: 'message field used', rule: 'test-rule' }],
          security: [],
          optimization: [],
          styling: [],
        },
      },
    };

    const result = generateJSONReport('test-repo', files, reviewResult, outputPath);
    assert.equal(result.success, true);

    const report = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    assert.equal(report.findings[0].message, 'message field used');
  });
});

test('generateJSONReport falls back to empty string when both description and message are absent', async () => {
  await withTempFile(async (outputPath) => {
    const files = [{ name: 'src/empty.js' }];
    const reviewResult = {
      fileReviews: {
        'src/empty.js': {
          bugs: [{ line: 5, rule: 'test-rule' }],
          security: [],
          optimization: [],
          styling: [],
        },
      },
    };

    const result = generateJSONReport('test-repo', files, reviewResult, outputPath);
    assert.equal(result.success, true);

    const report = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    assert.equal(report.findings[0].message, '');
  });
});

test('generateJSONReport defaults line to 1 when missing', async () => {
  await withTempFile(async (outputPath) => {
    const files = [{ name: 'src/noline.js' }];
    const reviewResult = {
      fileReviews: {
        'src/noline.js': {
          bugs: [{ description: 'no line number', rule: 'test-rule' }],
          security: [],
          optimization: [],
          styling: [],
        },
      },
    };

    const result = generateJSONReport('test-repo', files, reviewResult, outputPath);
    assert.equal(result.success, true);

    const report = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    assert.equal(report.findings[0].line, 1);
  });
});
