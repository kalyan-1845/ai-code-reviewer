import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidGithubToken } from '../utils/tokenValidator.js';

test('isValidGithubToken accepts valid token formats', () => {
  assert.equal(isValidGithubToken('ghp_1234567890abcdefghijklmnopqrstuvwxyz'), true);
  assert.equal(isValidGithubToken('gho_1234567890abcdefghijklmnopqrstuvwxyz'), true);
  assert.equal(isValidGithubToken('ghu_1234567890abcdefghijklmnopqrstuvwxyz'), true);
  assert.equal(isValidGithubToken('ghs_1234567890abcdefghijklmnopqrstuvwxyz'), true);
  assert.equal(isValidGithubToken('ghr_1234567890abcdefghijklmnopqrstuvwxyz'), true);
  assert.equal(isValidGithubToken('github_pat_1234567890abcdefghijklmnopqrstuvwxyz'), true);
});

test('isValidGithubToken rejects invalid token formats', () => {
  assert.equal(isValidGithubToken(''), false);
  assert.equal(isValidGithubToken(null), false);
  assert.equal(isValidGithubToken(undefined), false);
  assert.equal(isValidGithubToken(123), false);
  assert.equal(isValidGithubToken('invalid_token'), false);
  assert.equal(isValidGithubToken('ghp_'), false);
});

test('isValidGithubToken rejects overly long tokens to prevent catastrophic backtracking', () => {
  const longToken = 'ghp_' + 'a'.repeat(300);
  assert.equal(isValidGithubToken(longToken), false);
});
