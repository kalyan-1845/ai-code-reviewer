import test from 'node:test';
import assert from 'node:assert/strict';
import { scrubRepositoryPayload } from '../utils/secretScrubber.js';

test('scrubRepositoryPayload returns non-string input unchanged', () => {
  assert.equal(scrubRepositoryPayload(null), null);
  assert.equal(scrubRepositoryPayload(undefined), undefined);
  assert.equal(scrubRepositoryPayload(42), 42);
});

test('scrubRepositoryPayload returns empty string for empty input', () => {
  assert.equal(scrubRepositoryPayload(''), '');
});

test('scrubRepositoryPayload does not modify string with no secrets', () => {
  const clean = 'const x = 42; // no secrets here';
  assert.equal(scrubRepositoryPayload(clean), clean);
});

test('scrubRepositoryPayload redacts AWS Access Key IDs (AKIA...)', () => {
  const input = 'AWS_ACCESS_KEY=AKIAIOSFODNN7EXAMPLE';
  const result = scrubRepositoryPayload(input);
  assert.equal(result.includes('AKIAIOSFODNN7EXAMPLE'), false, 'AKIA key should be redacted');
  assert.ok(result.includes('[REDACTED_SECRET]'), 'redaction marker should appear');
});

test('scrubRepositoryPayload redacts AWS Secret Access Keys (40-char base64-like)', () => {
  // 40-char base64-like string preceded by a space (to avoid false positives from the lookbehind)
  const input = 'aws secret: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
  const result = scrubRepositoryPayload(input);
  assert.equal(result.includes('wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'), false, 'AWS secret key should be redacted');
  assert.ok(result.includes('[REDACTED_SECRET]'), 'redaction marker should appear');
});

test('scrubRepositoryPayload redacts GitHub PATs (ghp_...)', () => {
  const input = 'const GITHUB_TOKEN = "ghp_FFFFFFFFFF0000000000AAAAAAAAAA111111";';
  const result = scrubRepositoryPayload(input);
  assert.equal(result.includes('ghp_FFFFFFFFFF0000000000AAAAAAAAAA111111'), false, 'GitHub PAT should be redacted');
  assert.ok(result.includes('[REDACTED_SECRET]'), 'redaction marker should appear');
});

test('scrubRepositoryPayload redacts GitHub OAuth tokens (gho_...)', () => {
  const input = 'Authorization: gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
  const result = scrubRepositoryPayload(input);
  assert.equal(result.includes('gho_'), false, 'GitHub OAuth token should be redacted');
  assert.ok(result.includes('[REDACTED_SECRET]'), 'redaction marker should appear');
});

test('scrubRepositoryPayload redacts GitHub User Access Tokens (ghu_...)', () => {
  const input = 'Authorization: ghu_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
  const result = scrubRepositoryPayload(input);
  assert.equal(result.includes('ghu_'), false, 'GitHub User token should be redacted');
  assert.ok(result.includes('[REDACTED_SECRET]'), 'redaction marker should appear');
});

test('scrubRepositoryPayload redacts GitHub Server Access Tokens (ghs_...)', () => {
  const input = 'Authorization: ghs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
  const result = scrubRepositoryPayload(input);
  assert.equal(result.includes('ghs_'), false, 'GitHub Server token should be redacted');
  assert.ok(result.includes('[REDACTED_SECRET]'), 'redaction marker should appear');
});

test('scrubRepositoryPayload redacts GitHub Refresh Tokens (ghr_...)', () => {
  const input = 'Authorization: ghr_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
  const result = scrubRepositoryPayload(input);
  assert.equal(result.includes('ghr_'), false, 'GitHub Refresh token should be redacted');
  assert.ok(result.includes('[REDACTED_SECRET]'), 'redaction marker should appear');
});

test('scrubRepositoryPayload redacts JWT tokens (eyJ...)', () => {
  const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  const result = scrubRepositoryPayload(input);
  assert.equal(result.includes('eyJ'), false, 'JWT should be redacted');
  assert.equal(result.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ'), false);
  assert.ok(result.includes('[REDACTED_SECRET]'), 'redaction marker should appear');
});

test('scrubRepositoryPayload redacts Bearer authorization tokens', () => {
  const input = 'Authorization: Bearer super_secret_bearer_token_12345';
  const result = scrubRepositoryPayload(input);
  assert.equal(result.includes('super_secret_bearer_token_12345'), false, 'Bearer token should be redacted');
  assert.ok(result.includes('[REDACTED_SECRET]'), 'redaction marker should appear');
});

test('scrubRepositoryPayload redacts api_key assignments', () => {
  const input = 'api_key: "sk_fake0000000000000000000000000000000000"';
  const result = scrubRepositoryPayload(input);
  assert.equal(result.includes('sk_fake0000000000000000000000000000000000'), false, 'api_key value should be redacted');
  assert.ok(result.includes('[REDACTED_SECRET]'), 'redaction marker should appear');
});

test('scrubRepositoryPayload redacts secret_key assignments', () => {
  const input = 'secret_key: "fake_secret_key_0000000000000000000000"';
  const result = scrubRepositoryPayload(input);
  assert.equal(result.includes('fake_secret_key_0000000000000000000000'), false, 'secret_key value should be redacted');
  assert.ok(result.includes('[REDACTED_SECRET]'), 'redaction marker should appear');
});

test('scrubRepositoryPayload redacts auth_token assignments', () => {
  const input = 'auth_token = "auth_token_secret_value_here12345"';
  const result = scrubRepositoryPayload(input);
  assert.equal(result.includes('auth_token_secret_value_here12345'), false, 'auth_token value should be redacted');
  assert.ok(result.includes('[REDACTED_SECRET]'), 'redaction marker should appear');
});

test('scrubRepositoryPayload redacts access_token assignments', () => {
  const input = 'access_token: "my_access_token_value_here123"';
  const result = scrubRepositoryPayload(input);
  assert.equal(result.includes('my_access_token_value_here123'), false, 'access_token value should be redacted');
  assert.ok(result.includes('[REDACTED_SECRET]'), 'redaction marker should appear');
});

test('scrubRepositoryPayload handles multiple secrets in the same string', () => {
  const input = 'AKIAIOSFODNN7EXAMPLE and ghp_FFFFFFFFFF0000000000AAAAAAAAAA111111 and Authorization: Bearer fakesecretbearertoken1234';
  const result = scrubRepositoryPayload(input);
  assert.equal(result.includes('AKIAIOSFODNN7EXAMPLE'), false);
  assert.equal(result.includes('ghp_FFFFFFFFFF0000000000AAAAAAAAAA111111'), false);
  assert.equal(result.includes('fakesecretbearertoken1234'), false);
});

test('scrubRepositoryPayload redacts in multi-line code block', () => {
  const input = `function configure() {
  const token = 'ghp_FFFFFFFFFF0000000000AAAAAAAAAA111111';
  const awsKey = 'AKIAIOSFODNN7EXAMPLE';
  return { token, awsKey };
}`;
  const result = scrubRepositoryPayload(input);
  assert.equal(result.includes('ghp_FFFFFFFFFF0000000000AAAAAAAAAA111111'), false);
  assert.equal(result.includes('AKIAIOSFODNN7EXAMPLE'), false);
});
