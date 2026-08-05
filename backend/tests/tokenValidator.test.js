import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidGithubToken } from '../utils/tokenValidator.js';

test('isValidGithubToken validates GitHub token prefixes and classic 40-hex PATs', () => {
  assert.equal(isValidGithubToken('ghp_1234567890abcdefghijklmnopqrstuvwxyz'), true);
  assert.equal(isValidGithubToken('github_pat_11AAAAAAA01234567890'), true);
  assert.equal(isValidGithubToken('e3b0c44298fc1c149afbf4c8996fb92427ae41e4'), true);
  assert.equal(isValidGithubToken(' ghp_1234567890abcdefghijklmnopqrstuvwxyz \n'), true);
  assert.equal(isValidGithubToken('invalid_token_format'), false);
  assert.equal(isValidGithubToken(''), false);
  assert.equal(isValidGithubToken(null), false);
});
