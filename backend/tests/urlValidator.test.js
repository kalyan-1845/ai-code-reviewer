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
