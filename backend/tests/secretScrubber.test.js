import test from 'node:test';
import assert from 'node:assert/strict';
import { scrubRepositoryPayload } from '../utils/secretScrubber.js';

test('scrubRepositoryPayload scrubs AWS Access Key ID and PATs', () => {
  const payload = 'AWS_KEY=AKIAIOSFODNN7EXAMPLE\nPAT=ghp_1234567890abcdefghijklmnopqrstuvwxyz';
  const sanitized = scrubRepositoryPayload(payload);
  assert.ok(!sanitized.includes('AKIAIOSFODNN7EXAMPLE'));
  assert.ok(!sanitized.includes('ghp_1234567890abcdefghijklmnopqrstuvwxyz'));
  assert.ok(sanitized.includes('[REDACTED_SECRET]'));
});

test('scrubRepositoryPayload preserves valid 40-character Git commit SHAs', () => {
  const sha = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4';
  const payload = `commit ${sha}\nAuthor: developer`;
  const sanitized = scrubRepositoryPayload(payload);
  assert.equal(sanitized.includes(sha), true);
test('scrubRepositoryPayload: redacts AWS Access Key ID (AKIA prefix)', () => {
  const input = 'AWS_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE';
  const result = scrubRepositoryPayload(input);
  assert.ok(!result.includes('AKIAIOSFODNN7EXAMPLE'), 'should not contain raw key');
  assert.ok(result.includes('[REDACTED_SECRET]'), 'should contain redaction marker');
});

test('scrubRepositoryPayload: redacts GitHub PAT (ghp_ prefix)', () => {
  // GitHub PAT regex: ghp_ + exactly 36 alphanumeric chars
  const pat = 'ghp_' + 'x'.repeat(36);
  const input = 'token: ' + pat;
  const result = scrubRepositoryPayload(input);
  assert.ok(!result.includes(pat), 'should not contain raw PAT');
  assert.ok(result.includes('[REDACTED_SECRET]'), 'should contain redaction marker');
});

test('scrubRepositoryPayload: redacts GitHub OAuth token (gho_ prefix)', () => {
  // GitHub token regex requires exactly 36 chars after prefix
  const token = 'gho_' + 'x'.repeat(36);
  const input = 'token: ' + token;
  const result = scrubRepositoryPayload(input);
  assert.ok(!result.includes(token), 'should not contain raw token');
  assert.ok(result.includes('[REDACTED_SECRET]'), 'should contain redaction marker');
});

test('scrubRepositoryPayload: redacts JWT (eyJ header)', () => {
  const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  const result = scrubRepositoryPayload(input);
  assert.ok(!result.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'), 'should not contain JWT header');
});

test('scrubRepositoryPayload: redacts generic api_key assignment with 20+ char values', () => {
  const input = 'const api_key = "abcdefghijklmnopqrst"';
  const result = scrubRepositoryPayload(input);
  assert.ok(!result.includes('abcdefghijklmnopqrst'), 'should not contain raw API key');
  assert.ok(result.includes('[REDACTED_SECRET]'), 'should contain redaction marker');
});

test('scrubRepositoryPayload: redacts Bearer authorization tokens', () => {
  // Bearer token regex requires 20+ base64 chars
  const bearerToken = 'Bearer ' + 'A'.repeat(25);
  const input = 'Authorization: ' + bearerToken;
  const result = scrubRepositoryPayload(input);
  assert.ok(!result.includes(bearerToken), 'should redact full Bearer token');
  assert.ok(result.includes('[REDACTED_SECRET]'), 'should contain redaction marker');
});

test('scrubRepositoryPayload: returns input unchanged when no secrets present', () => {
  const input = 'const foo = bar;\nfunction hello() { return 42; }';
  const result = scrubRepositoryPayload(input);
  assert.equal(result, input, 'should return exact input when no secrets found');
});

test('scrubRepositoryPayload: returns non-string input unchanged', () => {
  assert.equal(scrubRepositoryPayload(null), null);
  assert.equal(scrubRepositoryPayload(undefined), undefined);
  assert.equal(scrubRepositoryPayload(123), 123);
});

test('scrubRepositoryPayload: redacts multiple secrets in same input', () => {
  const awsKey = 'AKIAIOSFODNN7EXAMPLE';
  const pat = 'ghp_' + 'x'.repeat(36);
  const input = 'AWS=' + awsKey + ' and token=' + pat;
  const result = scrubRepositoryPayload(input);
  assert.ok(!result.includes(awsKey), 'should redact AWS key');
  assert.ok(!result.includes(pat), 'should redact GitHub PAT');
  assert.ok(result.includes('[REDACTED_SECRET]'), 'should contain redaction marker(s)');
});

test('scrubRepositoryPayload: does not flag short strings as generic API keys', () => {
  const input = 'const key = "shortvalue"';
  const result = scrubRepositoryPayload(input);
  assert.ok(result.includes('shortvalue'), 'short values should not be redacted');
});
