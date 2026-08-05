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
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isValidGithubToken } from '../utils/tokenValidator.js';

describe('isValidGithubToken', () => {
  it('returns true for ghp_ classic PAT', () => {
    assert.equal(isValidGithubToken('ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'), true);
  });

  it('returns true for gho_ org PAT', () => {
    assert.equal(isValidGithubToken('gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'), true);
  });

  it('returns true for ghu_ OAuth token', () => {
    assert.equal(isValidGithubToken('ghu_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'), true);
  });

  it('returns true for ghs_ server/app token', () => {
    assert.equal(isValidGithubToken('ghs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'), true);
  });

  it('returns true for ghr_ refresh token', () => {
    assert.equal(isValidGithubToken('ghr_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'), true);
  });

  it('returns true for github_pat_ fine-grained PAT', () => {
    assert.equal(isValidGithubToken('github_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxx'), true);
  });

  it('returns false for null', () => {
    assert.equal(isValidGithubToken(null), false);
  });

  it('returns false for undefined', () => {
    assert.equal(isValidGithubToken(undefined), false);
  });

  it('returns false for empty string', () => {
    assert.equal(isValidGithubToken(''), false);
  });

  it('returns false for number input', () => {
    assert.equal(isValidGithubToken(0), false);
    assert.equal(isValidGithubToken(123), false);
  });

  it('returns false for object input', () => {
    assert.equal(isValidGithubToken({}), false);
  });

  it('returns false for array input', () => {
    assert.equal(isValidGithubToken([]), false);
  });

  it('returns false for string with wrong prefix', () => {
    assert.equal(isValidGithubToken('ghp_'), false);
    assert.equal(isValidGithubToken('random_string'), false);
    assert.equal(isValidGithubToken('token_xxxx'), false);
    assert.equal(isValidGithubToken('gho_'), false);
  });

  it('returns false for string with valid prefix but non-alphanumeric characters', () => {
    assert.equal(isValidGithubToken('ghp_xxxx xxxx'), false);
    assert.equal(isValidGithubToken('ghs_xxxx-xxxx'), false);
    assert.equal(isValidGithubToken('ghp_xxxx!xxxx'), false);
  });

  it('returns true for valid token with underscores in the body', () => {
    assert.equal(isValidGithubToken('ghp_aaaa_bbbb_cccc_dddd_eeee'), true);
  });

  it('returns boolean true, not truthy value', () => {
    const result = isValidGithubToken('ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
    assert.equal(typeof result, 'boolean');
    assert.equal(result === true, true);
  });

  it('returns boolean false, not falsy value', () => {
    const result = isValidGithubToken('invalid');
    assert.equal(typeof result, 'boolean');
    assert.equal(result === false, true);
  });
});
