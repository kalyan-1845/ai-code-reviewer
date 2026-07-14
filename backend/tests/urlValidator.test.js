import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidRepoUrl, parseRepoUrl } from '../utils/urlValidator.js';

test('isValidRepoUrl should accept valid GitHub URLs', () => {
  assert.equal(isValidRepoUrl('https://github.com/owner/repo'), true);
  assert.equal(isValidRepoUrl('https://github.com/owner/repo/'), true);
  assert.equal(isValidRepoUrl('https://github.com/owner/repo.git'), true);
  assert.equal(isValidRepoUrl('https://github.com/owner/repo-name'), true);
  assert.equal(isValidRepoUrl('https://github.com/owner-name/repo'), true);
  assert.equal(isValidRepoUrl('https://github.com/owner.name/repo.name'), true);
});

test('isValidRepoUrl should reject invalid URLs', () => {
  assert.equal(isValidRepoUrl(''), false);
  assert.equal(isValidRepoUrl(null), false);
  assert.equal(isValidRepoUrl(undefined), false);
  assert.equal(isValidRepoUrl('not-a-url'), false);
  assert.equal(isValidRepoUrl('https://github.com/owner'), false);
  assert.equal(isValidRepoUrl('https://gitlab.com/owner/repo'), false);
  assert.equal(isValidRepoUrl('http://github.com/owner/repo'), false);
  assert.equal(isValidRepoUrl('https://github.com/owner/repo; echo injected'), false);
  assert.equal(isValidRepoUrl('https://github.com/owner/repo`id`'), false);
  assert.equal(isValidRepoUrl('https://github.com/owner/repo?query=1'), false);
  assert.equal(isValidRepoUrl('https://github.com/owner/repo#fragment'), false);
  assert.equal(isValidRepoUrl('https://github.com/owner/repo | cat /etc/passwd'), false);
  assert.equal(isValidRepoUrl('https://github.com/owner/repo && whoami'), false);
});

test('isValidRepoUrl should reject URLs exceeding max length (#2456)', () => {
  const baseUrl = 'https://github.com/owner/repo';
  const longPath = 'a'.repeat(3000);
  const longUrl = baseUrl + '/' + longPath;
  assert.equal(longUrl.length > 2048, true, 'test URL must exceed the 2048 char limit');
  assert.equal(isValidRepoUrl(longUrl), false, 'URL exceeding max length should be rejected');
});

test('parseRepoUrl should extract owner and repo', () => {
  const result = parseRepoUrl('https://github.com/owner/repo');
  assert.notEqual(result, null);
  assert.equal(result.owner, 'owner');
  assert.equal(result.repo, 'repo');
});

test('parseRepoUrl should handle .git suffix', () => {
  const result = parseRepoUrl('https://github.com/owner/repo.git');
  assert.notEqual(result, null);
  assert.equal(result.owner, 'owner');
  assert.equal(result.repo, 'repo');
});

test('parseRepoUrl should return null for invalid URLs', () => {
  assert.equal(parseRepoUrl('invalid'), null);
  assert.equal(parseRepoUrl(''), null);
  assert.equal(parseRepoUrl('https://github.com/owner/repo; rm -rf /'), null);
});

test('parseRepoUrl should return null for null/undefined input', () => {
  assert.equal(parseRepoUrl(null), null);
  assert.equal(parseRepoUrl(undefined), null);
});

test('parseRepoUrl should handle trailing slashes correctly', () => {
  const result = parseRepoUrl('https://github.com/owner/repo/');
  assert.notEqual(result, null);
  assert.equal(result.owner, 'owner');
  assert.equal(result.repo, 'repo');
});

test('parseRepoUrl should handle .git/ trailing suffix', () => {
  const result = parseRepoUrl('https://github.com/owner/repo.git/');
  assert.notEqual(result, null);
  assert.equal(result.owner, 'owner');
  assert.equal(result.repo, 'repo');
});

test('parseRepoUrl returns null for URLs with multiple trailing slashes', () => {
  // isValidRepoUrl rejects URLs with multiple trailing slashes
  assert.equal(parseRepoUrl('https://github.com/owner/repo//'), null);
});

test('parseRepoUrl should return null for URLs with extra path segments', () => {
  assert.equal(parseRepoUrl('https://github.com/owner/repo/pull/1'), null);
  assert.equal(parseRepoUrl('https://github.com/owner/repo/tree/main/src'), null);
});
