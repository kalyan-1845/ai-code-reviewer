import test from 'node:test';
import assert from 'node:assert/strict';
import { createCheckRun } from '../utils/githubChecksIntegration.js';

test('createCheckRun calls octokit.checks.create with correct owner, repo, and sha', async () => {
  const mockOctokit = {
    rest: {
      checks: {
        create: async () => ({
          data: { id: 12345 },
        }),
      },
    },
  };

  const findings = [
    { file: 'src/app.js', line: 10, message: 'unused variable', severity: 'warning', rule_id: 'no-unused-vars' },
  ];

  await createCheckRun(mockOctokit, 'test-owner', 'test-repo', 'abc123sha', findings);

  assert.ok(true, 'createCheckRun did not throw');
});

test('createCheckRun sets check run title and status to completed', async () => {
  let capturedPayload = null;
  const mockOctokit = {
    rest: {
      checks: {
        create: async (payload) => {
          capturedPayload = payload;
          return { data: { id: 12345 } };
        },
      },
    },
  };

  const findings = [
    { file: 'src/app.js', line: 10, message: 'unused variable', severity: 'warning', rule_id: 'no-unused-vars' },
  ];

  await createCheckRun(mockOctokit, 'owner', 'repo', 'sha123', findings);

  assert.equal(capturedPayload.status, 'completed');
  assert.equal(capturedPayload.name, 'Code Review');
  assert.equal(capturedPayload.head_sha, 'sha123');
});

test('createCheckRun calls octokit.rest.checks.create with findings', async () => {
  let createCallCount = 0;
  const mockOctokit = {
    rest: {
      checks: {
        create: async () => {
          createCallCount++;
          return { data: { id: createCallCount } };
        },
      },
    },
  };

  const findings = [
    { file: 'src/app.js', line: 10, message: 'bug', severity: 'error', rule_id: 'bug-rule' },
  ];

  await createCheckRun(mockOctokit, 'owner', 'repo', 'sha123', findings);
  assert.equal(createCallCount, 1);
});

test('createCheckRun returns check run IDs and batch count', async () => {
  const mockOctokit = {
    rest: {
      checks: {
        create: async () => ({ data: { id: 99999 } }),
      },
    },
  };

  const findings = [
    { file: 'src/app.js', line: 10, message: 'bug', severity: 'error', rule_id: 'bug-rule' },
  ];

  const result = await createCheckRun(mockOctokit, 'owner', 'repo', 'sha123', findings);

  assert.ok(result.checkRunIds.includes(99999));
  assert.equal(result.totalAnnotations, 1);
  assert.equal(result.batchCount, 1);
});

test('createCheckRun batches findings into chunks of 50', async () => {
  let createCallCount = 0;
  const mockOctokit = {
    rest: {
      checks: {
        create: async () => {
          createCallCount++;
          return { data: { id: createCallCount } };
        },
      },
    },
  };

  // 120 findings should produce 3 batches (50, 50, 20)
  const findings = Array.from({ length: 120 }, (_, i) => ({
    file: `src/file${i}.js`,
    line: 10,
    message: `finding ${i}`,
    severity: 'warning',
    rule_id: `rule-${i}`,
  }));

  await createCheckRun(mockOctokit, 'owner', 'repo', 'sha123', findings);
  assert.equal(createCallCount, 3);
});

test('createCheckRun sets conclusion to failure when findings include error severity', async () => {
  let capturedPayload = null;
  const mockOctokit = {
    rest: {
      checks: {
        create: async (payload) => {
          capturedPayload = payload;
          return { data: { id: 1 } };
        },
      },
    },
  };

  const findings = [
    { file: 'src/app.js', line: 10, message: 'unused variable', severity: 'warning', rule_id: 'no-unused-vars' },
    { file: 'src/bug.js', line: 5, message: 'critical bug', severity: 'error', rule_id: 'bug-rule' },
  ];

  await createCheckRun(mockOctokit, 'owner', 'repo', 'sha123', findings);
  assert.equal(capturedPayload.conclusion, 'failure');
});

test('createCheckRun sets conclusion to success when no error severity findings', async () => {
  let capturedPayload = null;
  const mockOctokit = {
    rest: {
      checks: {
        create: async (payload) => {
          capturedPayload = payload;
          return { data: { id: 1 } };
        },
      },
    },
  };

  const findings = [
    { file: 'src/app.js', line: 10, message: 'unused variable', severity: 'warning', rule_id: 'no-unused-vars' },
    { file: 'src/style.js', line: 5, message: 'style issue', severity: 'info', rule_id: 'style-rule' },
  ];

  await createCheckRun(mockOctokit, 'owner', 'repo', 'sha123', findings);
  assert.equal(capturedPayload.conclusion, 'success');
});

test('createCheckRun produces correct batch titles for multi-batch runs', async () => {
  const capturedPayloads = [];
  const mockOctokit = {
    rest: {
      checks: {
        create: async (payload) => {
          capturedPayloads.push(payload);
          return { data: { id: capturedPayloads.length } };
        },
      },
    },
  };

  // 120 findings = 3 batches
  const findings = Array.from({ length: 120 }, (_, i) => ({
    file: `src/file${i}.js`,
    line: 10,
    message: `finding ${i}`,
    severity: 'warning',
    rule_id: `rule-${i}`,
  }));

  await createCheckRun(mockOctokit, 'owner', 'repo', 'sha123', findings);

  assert.equal(capturedPayloads[0].output.title, 'Code Review Results (Batch 1/3)');
  assert.equal(capturedPayloads[1].output.title, 'Code Review Results (Batch 2/3)');
  assert.equal(capturedPayloads[2].output.title, 'Code Review Results (Batch 3/3)');
});

test('createCheckRun returns null when findings is empty array', async () => {
  const mockOctokit = {
    rest: {
      checks: {
        create: async () => ({ data: { id: 1 } }),
      },
    },
  };

  const result = await createCheckRun(mockOctokit, 'owner', 'repo', 'sha123', []);
  assert.equal(result, null);
});

test('createCheckRun returns null when findings is null', async () => {
  const mockOctokit = {
    rest: {
      checks: {
        create: async () => ({ data: { id: 1 } }),
      },
    },
  };

  const result = await createCheckRun(mockOctokit, 'owner', 'repo', 'sha123', null);
  assert.equal(result, null);
});

test('createCheckRun throws Error when octokit is missing', async () => {
  try {
    await createCheckRun(null, 'owner', 'repo', 'sha123', [{ file: 'f', line: 1, message: 'x', severity: 'error', rule_id: 'r' }]);
    assert.fail('Expected Error to be thrown');
  } catch (e) {
    assert.ok(e.message.includes('Missing required parameters'));
  }
});

test('createCheckRun throws Error when owner is missing', async () => {
  try {
    await createCheckRun({}, null, 'repo', 'sha123', [{ file: 'f', line: 1, message: 'x', severity: 'error', rule_id: 'r' }]);
    assert.fail('Expected Error to be thrown');
  } catch (e) {
    assert.ok(e.message.includes('Missing required parameters'));
  }
});

test('createCheckRun throws Error when sha is missing', async () => {
  try {
    await createCheckRun({}, 'owner', 'repo', null, [{ file: 'f', line: 1, message: 'x', severity: 'error', rule_id: 'r' }]);
    assert.fail('Expected Error to be thrown');
  } catch (e) {
    assert.ok(e.message.includes('Missing required parameters'));
  }
});

test('createCheckRun throws octokit error and re-throws it', async () => {
  const mockOctokit = {
    rest: {
      checks: {
        create: async () => {
          throw new Error('GitHub API error: 403 Forbidden');
        },
      },
    },
  };

  const findings = [
    { file: 'src/app.js', line: 10, message: 'bug', severity: 'error', rule_id: 'bug-rule' },
  ];

  try {
    await createCheckRun(mockOctokit, 'owner', 'repo', 'sha123', findings);
    assert.fail('Expected Error to be re-thrown');
  } catch (e) {
    assert.ok(e.message.includes('GitHub API error'));
  }
});

test('createCheckRun returns correct batchCount for single batch', async () => {
  const mockOctokit = {
    rest: {
      checks: {
        create: async () => ({ data: { id: 1 } }),
      },
    },
  };

  const findings = [
    { file: 'src/app.js', line: 10, message: 'bug', severity: 'error', rule_id: 'bug-rule' },
  ];

  const result = await createCheckRun(mockOctokit, 'owner', 'repo', 'sha123', findings);
  assert.equal(result.batchCount, 1);
  assert.equal(result.totalAnnotations, 1);
  assert.equal(result.checkRunIds.length, 1);
});

test('createCheckRun summary reflects total findings across all batches', async () => {
  let capturedPayloads = [];
  const mockOctokit = {
    rest: {
      checks: {
        create: async (payload) => {
          capturedPayloads.push(payload);
          return { data: { id: capturedPayloads.length } };
        },
      },
    },
  };

  // 60 findings = 2 batches
  const findings = Array.from({ length: 60 }, (_, i) => ({
    file: `src/file${i}.js`,
    line: 10,
    message: `finding ${i}`,
    severity: 'warning',
    rule_id: `rule-${i}`,
  }));

  await createCheckRun(mockOctokit, 'owner', 'repo', 'sha123', findings);

  assert.equal(capturedPayloads[0].output.summary, '60 finding(s) detected');
  assert.equal(capturedPayloads[1].output.summary, '60 finding(s) detected');
});
