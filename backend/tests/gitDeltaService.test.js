import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidBranchName, getPullRequestDiff } from '../services/gitDeltaService.js';

// ---------------------------------------------------------------------------
// isValidBranchName
// ---------------------------------------------------------------------------

test('isValidBranchName accepts alphanumeric branch names', () => {
  assert.equal(isValidBranchName('main'), true);
  assert.equal(isValidBranchName('feature123'), true);
});

test('isValidBranchName accepts hyphens', () => {
  assert.equal(isValidBranchName('feature-branch'), true);
  assert.equal(isValidBranchName('fix-bug-123'), true);
});

test('isValidBranchName accepts underscores', () => {
  assert.equal(isValidBranchName('feature_branch'), true);
  assert.equal(isValidBranchName('fix_bug_123'), true);
});

test('isValidBranchName accepts slashes', () => {
  assert.equal(isValidBranchName('feature/new-feature'), true);
  assert.equal(isValidBranchName('bugfix/issue-42'), true);
  assert.equal(isValidBranchName('user/feature/branch'), true);
});

test('isValidBranchName accepts mixed valid characters', () => {
  assert.equal(isValidBranchName('feature-branch_123/user/feature'), true);
});

test('isValidBranchName rejects path traversal (..)', () => {
  assert.equal(isValidBranchName('..'), false);
  assert.equal(isValidBranchName('feature/../../../etc/passwd'), false);
  assert.equal(isValidBranchName('../feature'), false);
});

test('isValidBranchName rejects semicolons', () => {
  assert.equal(isValidBranchName('main; rm -rf'), false);
});

test('isValidBranchName rejects pipes', () => {
  assert.equal(isValidBranchName('main | cat /etc/passwd'), false);
});

test('isValidBranchName rejects backticks', () => {
  assert.equal(isValidBranchName('main `whoami`'), false);
});

test('isValidBranchName rejects dollar sign command substitution', () => {
  assert.equal(isValidBranchName('main$(whoami)'), false);
  assert.equal(isValidBranchName('main${whoami}'), false);
});

test('isValidBranchName rejects empty string', () => {
  assert.equal(isValidBranchName(''), false);
});

// ---------------------------------------------------------------------------
// getPullRequestDiff — security validation tests
// ---------------------------------------------------------------------------

test('getPullRequestDiff throws on invalid base branch name with path traversal', async () => {
  await assert.rejects(
    getPullRequestDiff('/repo/path', '../etc', 'main'),
    /Invalid base branch name/
  );
});

test('getPullRequestDiff throws on invalid head branch name with path traversal', async () => {
  await assert.rejects(
    getPullRequestDiff('/repo/path', 'main', '../../etc'),
    /Invalid head branch name/
  );
});

test('getPullRequestDiff throws on base branch with shell injection characters', async () => {
  await assert.rejects(
    getPullRequestDiff('/repo/path', 'main; rm -rf', 'main'),
    /Invalid base branch name/
  );
});

test('getPullRequestDiff throws on head branch with shell injection characters', async () => {
  await assert.rejects(
    getPullRequestDiff('/repo/path', 'main', 'main; rm -rf'),
    /Invalid head branch name/
  );
});

test('getPullRequestDiff throws on head branch with null byte', async () => {
  await assert.rejects(
    getPullRequestDiff('/repo/path', 'main', 'main\x00evil'),
    /Invalid head branch name/
  );
});

test('getPullRequestDiff throws on base branch with path traversal sequence', async () => {
  await assert.rejects(
    getPullRequestDiff('/repo/path', 'feature/../../../etc/passwd', 'main'),
    /Invalid base branch name/
  );
});
