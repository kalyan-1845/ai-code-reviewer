import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidBranchName, getPullRequestDiff } from '../services/gitDeltaService.js';

test('isValidBranchName: accepts valid branch names', () => {
  assert.equal(isValidBranchName('main'), true);
  assert.equal(isValidBranchName('feature-xyz'), true);
  assert.equal(isValidBranchName('feature/xyz'), true);
  assert.equal(isValidBranchName('feature_xyz'), true);
  assert.equal(isValidBranchName('feature/issue-123'), true);
  assert.equal(isValidBranchName('a'), true);
  assert.equal(isValidBranchName('Feature/Xyz-123_abc'), true);
});

test('isValidBranchName: rejects invalid branch names', () => {
  assert.equal(isValidBranchName(''), false);
  assert.equal(isValidBranchName('feature xyz'), false);
  assert.equal(isValidBranchName('feature\txyz'), false);
  assert.equal(isValidBranchName('feature\nxyz'), false);
  assert.equal(isValidBranchName('feature.xyz'), false);
  assert.equal(isValidBranchName('feature*xyz'), false);
  assert.equal(isValidBranchName('feature#xyz'), false);
  assert.equal(isValidBranchName('feature$xyz'), false);
});

test('isValidBranchName: rejects path traversal attempts', () => {
  assert.equal(isValidBranchName('..'), false);
  assert.equal(isValidBranchName('../etc/passwd'), false);
  assert.equal(isValidBranchName('foo/../bar'), false);
  assert.equal(isValidBranchName('foo..bar'), false);
});

test('getPullRequestDiff: throws on invalid base branch name', async () => {
  try {
    await getPullRequestDiff('/tmp/repo', 'feature xyz', 'main');
    assert.fail('Expected error to be thrown');
  } catch (err) {
    assert.ok(err.message.includes('Invalid base branch name'));
  }
});

test('getPullRequestDiff: throws on invalid head branch name', async () => {
  try {
    await getPullRequestDiff('/tmp/repo', 'main', 'feature xyz');
    assert.fail('Expected error to be thrown');
  } catch (err) {
    assert.ok(err.message.includes('Invalid head branch name'));
  }
});
