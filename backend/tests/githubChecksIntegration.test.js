import test from 'node:test';
import assert from 'node:assert/strict';
import {
  severityToGitHubLevel,
  formatAnnotations,
  batchAnnotations,
} from '../utils/githubChecksIntegration.js';

test('severityToGitHubLevel maps known severities correctly', () => {
  assert.equal(severityToGitHubLevel('error'), 'failure');
  assert.equal(severityToGitHubLevel('warning'), 'warning');
  assert.equal(severityToGitHubLevel('info'), 'notice');
});

test('severityToGitHubLevel returns notice for unknown severity', () => {
  assert.equal(severityToGitHubLevel('critical'), 'notice');
  assert.equal(severityToGitHubLevel('blocker'), 'notice');
  assert.equal(severityToGitHubLevel(''), 'notice');
  assert.equal(severityToGitHubLevel(undefined), 'notice');
});

test('formatAnnotations transforms findings to GitHub annotation shape', () => {
  const findings = [
    {
      file: 'src/index.js',
      line: 10,
      message: 'Unused variable',
      severity: 'warning',
      rule_id: 'no-unused-vars',
    },
    {
      file: 'src/utils.js',
      line: 25,
      message: 'Missing semicolon',
      severity: 'info',
      rule_id: 'semi',
    },
  ];
  const annotations = formatAnnotations(findings);

  assert.equal(annotations.length, 2);
  assert.equal(annotations[0].path, 'src/index.js');
  assert.equal(annotations[0].start_line, 10);
  assert.equal(annotations[0].end_line, 10);
  assert.equal(annotations[0].annotation_level, 'warning');
  assert.equal(annotations[0].message, 'Unused variable');
  assert.equal(annotations[0].title, 'no-unused-vars');

  assert.equal(annotations[1].path, 'src/utils.js');
  assert.equal(annotations[1].annotation_level, 'notice');
});

test('formatAnnotations handles empty findings array', () => {
  const annotations = formatAnnotations([]);
  assert.deepEqual(annotations, []);
});

test('formatAnnotations handles missing optional fields in findings', () => {
  const findings = [
    {
      file: 'src/index.js',
      line: 1,
      message: 'Simple error',
      severity: 'error',
    },
  ];
  const annotations = formatAnnotations(findings);
  assert.equal(annotations[0].title, 'unknown-rule');
  assert.equal(annotations[0].annotation_level, 'failure');
});

test('batchAnnotations splits into correct batch sizes', () => {
  const annotations = Array.from({ length: 120 }, (_, i) => ({
    path: `file${i}.js`,
    start_line: i,
    end_line: i,
    annotation_level: 'notice',
    message: `Finding ${i}`,
    title: `rule-${i}`,
  }));

  const batches = batchAnnotations(annotations);

  assert.equal(batches.length, 3);
  assert.equal(batches[0].length, 50);
  assert.equal(batches[1].length, 50);
  assert.equal(batches[2].length, 20);
});

test('batchAnnotations respects custom batch size', () => {
  const annotations = Array.from({ length: 25 }, (_, i) => ({
    path: `file${i}.js`,
    start_line: i,
    end_line: i,
    annotation_level: 'notice',
    message: `Finding ${i}`,
    title: `rule-${i}`,
  }));

  const batches = batchAnnotations(annotations, 10);

  assert.equal(batches.length, 3);
  assert.equal(batches[0].length, 10);
  assert.equal(batches[1].length, 10);
  assert.equal(batches[2].length, 5);
});

test('batchAnnotations handles empty array', () => {
  const batches = batchAnnotations([]);
  assert.deepEqual(batches, []);
});

test('batchAnnotations handles array smaller than batch size', () => {
  const annotations = [
    { path: 'file1.js', start_line: 1, end_line: 1, annotation_level: 'notice', message: 'Finding', title: 'rule' },
  ];
  const batches = batchAnnotations(annotations);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 1);
});

test('formatAnnotations defaults invalid or non-positive line numbers to 1', () => {
  const findings = [
    { file: 'file.js', line: 0, message: 'Zero line', severity: 'info' },
    { file: 'file.js', line: -5, message: 'Negative line', severity: 'info' },
    { file: 'file.js', line: null, message: 'Null line', severity: 'info' },
    { file: 'file.js', line: 'not-a-number', message: 'String line', severity: 'info' },
  ];
  const annotations = formatAnnotations(findings);
  assert.equal(annotations[0].start_line, 1);
  assert.equal(annotations[1].start_line, 1);
  assert.equal(annotations[2].start_line, 1);
  assert.equal(annotations[3].start_line, 1);
});
