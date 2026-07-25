import test from 'node:test';
import assert from 'node:assert/strict';
import {
  severityToGitHubLevel,
  formatAnnotations,
  batchAnnotations,
  createCheckRun,
} from '../utils/githubChecksIntegration.js';

test('severityToGitHubLevel maps known severities correctly', () => {
  assert.equal(severityToGitHubLevel('error'), 'failure');
  assert.equal(severityToGitHubLevel('warning'), 'neutral');
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
  assert.equal(annotations[0].annotation_level, 'neutral');
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
  assert.equal(annotations[0].title, undefined);
  assert.equal(annotations[0].annotation_level, 'failure');
});

test('formatAnnotations handles unknown severity', () => {
  const findings = [
    {
      file: 'src/index.js',
      line: 1,
      message: 'Unknown severity finding',
      severity: 'unknown',
      rule_id: 'test-rule',
    },
  ];
  const annotations = formatAnnotations(findings);
  assert.equal(annotations[0].annotation_level, 'notice');
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

test('createCheckRun throws when octokit is missing', async () => {
  await assert.rejects(
    async () => createCheckRun(null, 'owner', 'repo', 'sha123', [{ file: 'x.js', line: 1, message: 'm', severity: 'error' }]),
    /Missing required parameters/
  );
});

test('createCheckRun throws when owner is missing', async () => {
  const fakeOctokit = { rest: { checks: { create: async () => ({ data: { id: 1 } }) } } };
  await assert.rejects(
    async () => createCheckRun(fakeOctokit, '', 'repo', 'sha123', [{ file: 'x.js', line: 1, message: 'm', severity: 'error' }]),
    /Missing required parameters/
  );
});

test('createCheckRun throws when repo is missing', async () => {
  const fakeOctokit = { rest: { checks: { create: async () => ({ data: { id: 1 } }) } } };
  await assert.rejects(
    async () => createCheckRun(fakeOctokit, 'owner', '', 'sha123', [{ file: 'x.js', line: 1, message: 'm', severity: 'error' }]),
    /Missing required parameters/
  );
});

test('createCheckRun throws when sha is missing', async () => {
  const fakeOctokit = { rest: { checks: { create: async () => ({ data: { id: 1 } }) } } };
  await assert.rejects(
    async () => createCheckRun(fakeOctokit, 'owner', 'repo', '', [{ file: 'x.js', line: 1, message: 'm', severity: 'error' }]),
    /Missing required parameters/
  );
});

test('createCheckRun returns null when findings is empty array', async () => {
  const fakeOctokit = { rest: { checks: { create: async () => ({ data: { id: 1 } }) } } };
  const result = await createCheckRun(fakeOctokit, 'owner', 'repo', 'sha123', []);
  assert.equal(result, null);
});

test('createCheckRun returns null when findings is null', async () => {
  const fakeOctokit = { rest: { checks: { create: async () => ({ data: { id: 1 } }) } } };
  const result = await createCheckRun(fakeOctokit, 'owner', 'repo', 'sha123', null);
  assert.equal(result, null);
});

test('createCheckRun calls octokit with correct parameters for single finding', async () => {
  const capturedPayloads = [];
  const fakeOctokit = {
    rest: {
      checks: {
        create: async ({ owner, repo, head_sha, name, status, conclusion, output }) => {
          capturedPayloads.push({ owner, repo, head_sha, name, status, conclusion, output });
          return { data: { id: 42 } };
        },
      },
    },
  };

  const findings = [
    { file: 'src/app.js', line: 10, message: 'Bug found', severity: 'error', rule_id: 'no-bug' },
  ];

  const result = await createCheckRun(fakeOctokit, 'myowner', 'myrepo', 'abc123', findings);

  assert.equal(result.checkRunIds.length, 1);
  assert.equal(result.checkRunIds[0], 42);
  assert.equal(result.totalAnnotations, 1);
  assert.equal(result.batchCount, 1);
  assert.equal(capturedPayloads[0].owner, 'myowner');
  assert.equal(capturedPayloads[0].repo, 'myrepo');
  assert.equal(capturedPayloads[0].head_sha, 'abc123');
  assert.equal(capturedPayloads[0].status, 'completed');
  assert.equal(capturedPayloads[0].conclusion, 'failure', 'error severity should produce failure conclusion');
  assert.equal(capturedPayloads[0].output.title, 'Code Review Results (Batch 1/1)');
  assert.equal(capturedPayloads[0].output.annotations.length, 1);
});

test('createCheckRun conclusion is success when all findings are non-error severity', async () => {
  const capturedPayloads = [];
  const fakeOctokit = {
    rest: {
      checks: {
        create: async ({ conclusion }) => {
          capturedPayloads.push({ conclusion });
          return { data: { id: 1 } };
        },
      },
    },
  };

  const findings = [
    { file: 'src/app.js', line: 10, message: 'Warning', severity: 'warning', rule_id: 'warn' },
    { file: 'src/app.js', line: 20, message: 'Info', severity: 'info', rule_id: 'info' },
  ];

  const result = await createCheckRun(fakeOctokit, 'owner', 'repo', 'sha', findings);
  assert.equal(capturedPayloads[0].conclusion, 'success', 'non-error findings should produce success conclusion');
  assert.equal(result.totalAnnotations, 2);
});

test('createCheckRun batches findings when exceeding MAX_ANNOTATIONS_PER_REQUEST', async () => {
  const capturedPayloads = [];
  const fakeOctokit = {
    rest: {
      checks: {
        create: async ({ output }) => {
          capturedPayloads.push(output);
          return { data: { id: capturedPayloads.length } };
        },
      },
    },
  };

  // Generate 120 findings (3 batches of 50)
  const findings = Array.from({ length: 120 }, (_, i) => ({
    file: `file${i}.js`,
    line: i + 1,
    message: `Finding ${i}`,
    severity: 'warning',
    rule_id: `rule-${i}`,
  }));

  const result = await createCheckRun(fakeOctokit, 'owner', 'repo', 'sha', findings);

  assert.equal(result.batchCount, 3);
  assert.equal(capturedPayloads.length, 3);
  assert.equal(capturedPayloads[0].title, 'Code Review Results (Batch 1/3)');
  assert.equal(capturedPayloads[0].annotations.length, 50);
  assert.equal(capturedPayloads[1].title, 'Code Review Results (Batch 2/3)');
  assert.equal(capturedPayloads[1].annotations.length, 50);
  assert.equal(capturedPayloads[2].title, 'Code Review Results (Batch 3/3)');
  assert.equal(capturedPayloads[2].annotations.length, 20);
});
