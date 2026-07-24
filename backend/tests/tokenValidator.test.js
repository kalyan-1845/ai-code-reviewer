import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidGithubToken } from '../utils/tokenValidator.js';

test('isValidGithubToken: accepts ghp_ classic PAT format', () => {
  assert.equal(isValidGithubToken('ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'), true);
  assert.equal(isValidGithubToken('ghp_AbCdEfGhIjKlMnOpQrStUvWx'), true);
});

test('isValidGithubToken: accepts gho_ OAuth token format', () => {
  assert.equal(isValidGithubToken('gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'), true);
});

test('isValidGithubToken: accepts ghu_ user access token format', () => {
  assert.equal(isValidGithubToken('ghu_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'), true);
});

test('isValidGithubToken: accepts ghs_ server/app token format', () => {
  assert.equal(isValidGithubToken('ghs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'), true);
});

test('isValidGithubToken: accepts ghr_ refresh token format', () => {
  assert.equal(isValidGithubToken('ghr_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'), true);
});

test('isValidGithubToken: accepts github_pat_ fine-grained PAT format', () => {
  assert.equal(isValidGithubToken('github_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxx'), true);
});

test('isValidGithubToken: rejects wrong prefix git_', () => {
  assert.equal(isValidGithubToken('git_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'), false);
});

test('isValidGithubToken: rejects bare ghp without underscore', () => {
  assert.equal(isValidGithubToken('ghp'), false);
});

test('isValidGithubToken: rejects empty string', () => {
  assert.equal(isValidGithubToken(''), false);
});

test('isValidGithubToken: rejects whitespace-only string', () => {
  assert.equal(isValidGithubToken('   '), false);
});

test('isValidGithubToken: rejects non-string inputs', () => {
  assert.equal(isValidGithubToken(null), false);
  assert.equal(isValidGithubToken(undefined), false);
  assert.equal(isValidGithubToken(123), false);
  assert.equal(isValidGithubToken({}), false);
  assert.equal(isValidGithubToken([]), false);
});

test('isValidGithubToken: rejects token with spaces in value', () => {
  assert.equal(isValidGithubToken('ghp_xxxx xxxx xxxx xxxx xxxx'), false);
});

test('isValidGithubToken: accepts single char after valid prefix', () => {
  // Pattern accepts 1+ chars after prefix; single char is valid
  assert.equal(isValidGithubToken('ghp_x'), true);
});

test('isValidGithubToken: rejects empty prefix-only token', () => {
  assert.equal(isValidGithubToken('ghp_'), false);
});
