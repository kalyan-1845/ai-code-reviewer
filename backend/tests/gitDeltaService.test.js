import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidBranchName, getPullRequestDiff } from '../services/gitDeltaService.js';

// Override console.warn to suppress warnings during tests
const originalWarn = console.warn;
console.warn = () => {};

test('isValidBranchName returns true for simple branch names', () => {
  assert.strictEqual(isValidBranchName('main'), true);
  assert.strictEqual(isValidBranchName('master'), true);
  assert.strictEqual(isValidBranchName('develop'), true);
});

test('isValidBranchName returns true for branch names with hyphens and underscores', () => {
  assert.strictEqual(isValidBranchName('feature-branch'), true);
  assert.strictEqual(isValidBranchName('bugfix_my_issue'), true);
  assert.strictEqual(isValidBranchName('release-1.0.0'), true);
});

test('isValidBranchName returns true for branch names with slashes', () => {
  assert.strictEqual(isValidBranchName('feature/my-feature'), true);
  assert.strictEqual(isValidBranchName('bugfix/123/description'), true);
  assert.strictEqual(isValidBranchName('release/v1.0.0/rc1'), true);
});

test('isValidBranchName returns false for branch names with directory traversal', () => {
  assert.strictEqual(isValidBranchName('../etc/passwd'), false);
  assert.strictEqual(isValidBranchName('foo/../bar'), false);
  assert.strictEqual(isValidBranchName('..'), false);
});

test('isValidBranchName returns false for branch names with shell metacharacters', () => {
  assert.strictEqual(isValidBranchName('name;rm -rf'), false);
  assert.strictEqual(isValidBranchName('name|ls'), false);
  assert.strictEqual(isValidBranchName('name`ls`'), false);
  assert.strictEqual(isValidBranchName('name$(ls)'), false);
  assert.strictEqual(isValidBranchName('name>out'), false);
});

test('isValidBranchName returns false for null and undefined', () => {
  assert.strictEqual(isValidBranchName(null), false);
  assert.strictEqual(isValidBranchName(undefined), false);
});

test('isValidBranchName returns false for non-string inputs', () => {
  assert.strictEqual(isValidBranchName(123), false);
  assert.strictEqual(isValidBranchName({}), false);
  assert.strictEqual(isValidBranchName([]), false);
});

test('getPullRequestDiff throws for invalid base branch name', async () => {
  await assert.rejects(
    () => getPullRequestDiff('/some/repo', '../etc', 'main'),
    /Invalid base branch name/
  );
});

test('getPullRequestDiff throws for invalid head branch name', async () => {
  await assert.rejects(
    () => getPullRequestDiff('/some/repo', 'main', 'name;ls'),
    /Invalid head branch name/
  );
});

console.warn = originalWarn;
