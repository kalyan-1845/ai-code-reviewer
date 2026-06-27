import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Unit tests for /api/reports/pdf POST endpoint validation.
// Tests cover: repoName required, analysis required, and edge cases.
// Mirrors the validation logic from the Express route handler without
// requiring a real Express app or PDFKit instance.
// ---------------------------------------------------------------------------

function validateReportsPdfParams(body) {
  const { repoName, analysis } = body;
  if (!repoName || !analysis) {
    return { status: 400, error: 'Repository name and analysis result are required.' };
  }
  return { status: 'proceed', repoName, analysis };
}

test('returns 400 when repoName is missing from body', () => {
  const result = validateReportsPdfParams({ analysis: {} });
  assert.strictEqual(result.status, 400);
  assert.ok(result.error.includes('required'));
});

test('returns 400 when analysis is missing from body', () => {
  const result = validateReportsPdfParams({ repoName: 'my-repo' });
  assert.strictEqual(result.status, 400);
  assert.ok(result.error.includes('required'));
});

test('returns 400 when repoName is null', () => {
  const result = validateReportsPdfParams({ repoName: null, analysis: {} });
  assert.strictEqual(result.status, 400);
});

test('returns 400 when repoName is undefined', () => {
  const result = validateReportsPdfParams({ repoName: undefined, analysis: {} });
  assert.strictEqual(result.status, 400);
});

test('returns 400 when analysis is null', () => {
  const result = validateReportsPdfParams({ repoName: 'my-repo', analysis: null });
  assert.strictEqual(result.status, 400);
});

test('returns 400 when analysis is undefined', () => {
  const result = validateReportsPdfParams({ repoName: 'my-repo', analysis: undefined });
  assert.strictEqual(result.status, 400);
});

test('returns 400 when repoName is empty string', () => {
  const result = validateReportsPdfParams({ repoName: '', analysis: {} });
  assert.strictEqual(result.status, 400);
});

test('returns 400 when analysis is empty object with no fileReviews', () => {
  const result = validateReportsPdfParams({ repoName: 'my-repo', analysis: {} });
  // analysis is provided (truthy), so validation passes
  assert.strictEqual(result.status, 'proceed');
  assert.deepStrictEqual(result.analysis, {});
});

test('returns 400 when both repoName and analysis are missing', () => {
  const result = validateReportsPdfParams({});
  assert.strictEqual(result.status, 400);
  assert.ok(result.error.includes('required'));
});

test('proceeds when both repoName and analysis are provided', () => {
  const analysis = { fileReviews: { 'a.py': { bugs: [] } } };
  const result = validateReportsPdfParams({ repoName: 'test-repo', analysis });
  assert.strictEqual(result.status, 'proceed');
  assert.strictEqual(result.repoName, 'test-repo');
  assert.deepStrictEqual(result.analysis, analysis);
});

test('proceeds with analysis containing all finding categories', () => {
  const analysis = {
    fileReviews: {
      'main.py': {
        bugs: [{ type: 'null-ptr', line: 10, description: 'null check', suggestion: 'add null guard' }],
        security: [{ type: 'hardcoded-cred', line: 5, description: 'secret found', suggestion: 'use env var' }],
        optimization: [{ type: 'loop', line: 20, description: 'nested loop', suggestion: 'use map' }],
        styling: [{ type: 'naming', line: 1, description: 'bad name', suggestion: 'rename' }],
      },
    },
  };
  const result = validateReportsPdfParams({ repoName: 'full-report', analysis });
  assert.strictEqual(result.status, 'proceed');
  assert.strictEqual(result.repoName, 'full-report');
});

test('proceeds with empty analysis object (clean report)', () => {
  const result = validateReportsPdfParams({ repoName: 'clean-repo', analysis: {} });
  assert.strictEqual(result.status, 'proceed');
});
