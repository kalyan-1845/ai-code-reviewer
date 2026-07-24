import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidGithubToken } from '../utils/tokenValidator.js';

test('isValidGithubToken: accepts valid ghp_ classic PAT', () => {
  assert.ok(isValidGithubToken('ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'));
});

test('isValidGithubToken: accepts valid gho_ org PAT', () => {
  assert.ok(isValidGithubToken('gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'));
});

test('isValidGithubToken: accepts valid ghu_ user-to-server token', () => {
  assert.ok(isValidGithubToken('ghu_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'));
});

test('isValidGithubToken: accepts valid ghs_ server-to-server token', () => {
  assert.ok(isValidGithubToken('ghs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'));
});

test('isValidGithubToken: accepts valid ghr_ refresh token', () => {
  assert.ok(isValidGithubToken('ghr_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'));
});

test('isValidGithubToken: accepts valid github_pat_ fine-grained PAT', () => {
  assert.ok(isValidGithubToken('github_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'));
});

test('isValidGithubToken: rejects invalid prefix gh_ (too short)', () => {
  assert.ok(!isValidGithubToken('gh_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'));
});

test('isValidGithubToken: rejects invalid prefix gk_', () => {
  assert.ok(!isValidGithubToken('gkp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'));
});

test('isValidGithubToken: rejects invalid prefix git_', () => {
  assert.ok(!isValidGithubToken('git_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'));
});

test('isValidGithubToken: rejects plain alphanumeric strings', () => {
  assert.ok(!isValidGithubToken('abcdefghijklmnopqrstuvwxyz123456'));
});

test('isValidGithubToken: rejects empty string', () => {
  assert.ok(!isValidGithubToken(''));
});

test('isValidGithubToken: rejects null', () => {
  assert.ok(!isValidGithubToken(null));
});

test('isValidGithubToken: rejects undefined', () => {
  assert.ok(!isValidGithubToken(undefined));
});

test('isValidGithubToken: rejects number', () => {
  assert.ok(!isValidGithubToken(1234567890));
});

test('isValidGithubToken: rejects object', () => {
  assert.ok(!isValidGithubToken({}));
});

test('isValidGithubToken: rejects whitespace in token', () => {
  assert.ok(!isValidGithubToken('ghp_xxxx xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'));
});

test('isValidGithubToken: rejects token with only prefix and no chars', () => {
  assert.ok(!isValidGithubToken('ghp_'));
});

test('isValidGithubToken: accepts github_pat_ with minimum chars after prefix', () => {
  // github_pat_ + 1 char should pass the regex (it requires at least 1 char after prefix)
  assert.ok(isValidGithubToken('github_pat_x'));
});

test('isValidGithubToken: github_pat_ prefix is case-sensitive (requires lowercase)', () => {
  assert.ok(!isValidGithubToken('GITHUB_PAT_xxxxxxxxxxxxxxxxxxxxxxxx'));
  assert.ok(!isValidGithubToken('Github_pat_xxxxxxxxxxxxxxxxxxxxxxxx'));
});

test('isValidGithubToken: classic prefixes are case-sensitive', () => {
  assert.ok(!isValidGithubToken('GHP_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'));
  assert.ok(!isValidGithubToken('Gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'));
  assert.ok(!isValidGithubToken('GHS_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'));
  assert.ok(!isValidGithubToken('GHU_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'));
  assert.ok(!isValidGithubToken('GHR_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'));
});
