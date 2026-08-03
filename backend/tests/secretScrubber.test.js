import test from 'node:test';
import assert from 'node:assert/strict';
import { scrubRepositoryPayload } from '../utils/secretScrubber.js';

test('scrubRepositoryPayload redacts AWS Access Key IDs (AKIA pattern)', () => {
  const input = 'aws_access_key = "AKIAIOSFODNN7EXAMPLE"';
  const result = scrubRepositoryPayload(input);
  assert.ok(result.includes('[REDACTED_SECRET]'), 'AWS key should be redacted');
  assert.ok(!result.includes('AKIAIOSFODNN7EXAMPLE'), 'AWS key should not appear');
});

test('scrubRepositoryPayload redacts GitHub PATs (ghp_ pattern)', () => {
  const input = 'token = "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"';
  const result = scrubRepositoryPayload(input);
  assert.ok(result.includes('[REDACTED_SECRET]'));
  assert.ok(!result.includes('ghp_'), 'GitHub PAT should not appear');
});

test('scrubRepositoryPayload redacts JWTs (eyJ pattern)', () => {
  const input = 'jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"';
  const result = scrubRepositoryPayload(input);
  assert.ok(result.includes('[REDACTED_SECRET]'));
  assert.ok(!result.includes('eyJ'), 'JWT header should not appear');
});

test('scrubRepositoryPayload redacts generic API keys (api_key= pattern)', () => {
  const input = 'const api_key = "abcdefghijklmnopqrst";\nconst secret_key = "xyz1234567890abcdefghij";';
  const result = scrubRepositoryPayload(input);
  assert.ok(result.includes('[REDACTED_SECRET]'));
  assert.ok(!result.includes('abcdefghijklmnopqrst'), 'API key should not appear');
});

test('scrubRepositoryPayload does not redact non-secret strings', () => {
  const input = 'const message = "Hello World, this is not a secret!"';
  const result = scrubRepositoryPayload(input);
  assert.equal(result, input, 'Non-secret strings should be unchanged');
});

test('scrubRepositoryPayload handles empty string', () => {
  const result = scrubRepositoryPayload('');
  assert.equal(result, '');
});

test('scrubRepositoryPayload returns non-string input unchanged', () => {
  assert.equal(scrubRepositoryPayload(null), null);
  assert.equal(scrubRepositoryPayload(undefined), undefined);
  assert.equal(scrubRepositoryPayload(123), 123);
});

test('scrubRepositoryPayload scrubs multiple secrets in one string', () => {
  const input = 'const aws = "AKIAIOSFODNN7EXAMPLE";\nconst pat = "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";';
  const result = scrubRepositoryPayload(input);
  const count = (result.match(/\[REDACTED_SECRET\]/g) || []).length;
  assert.equal(count, 2, 'Both secrets should be redacted');
});

test('scrubRepositoryPayload handles multi-line code with secrets', () => {
  const input = `function getCredentials() {
  const awsKey = "AKIAIOSFODNN7EXAMPLE";
  return awsKey;
}`;
  const result = scrubRepositoryPayload(input);
  assert.ok(!result.includes('AKIAIOSFODNN7EXAMPLE'));
  assert.ok(result.includes('[REDACTED_SECRET]'));
});

test('scrubRepositoryPayload redacts bearer authorization tokens', () => {
  const input = 'Authorization: Bearer super_secret_token_value_here1234567890';
  const result = scrubRepositoryPayload(input);
  assert.ok(result.includes('[REDACTED_SECRET]'));
  assert.ok(!result.includes('super_secret_token'), 'Bearer token should be redacted');
});
