import test from 'node:test';
import assert from 'node:assert/strict';
import { scrubRepositoryPayload } from '../utils/secretScrubber.js';

// Note: GitHub PAT regex requires exactly 36 alphanumeric chars after the prefix.
// Pattern: gh[pousr]_[a-zA-Z0-9_]{36}  (total 40 chars including prefix+underscore)

const GHP36 = 'x'.repeat(36);

test('scrubRepositoryPayload: redacts AWS Access Key IDs', () => {
  const input = 'AKIAIOSFODNN7EXAMPLE';
  const result = scrubRepositoryPayload(input);
  assert.notEqual(result, input);
  assert.ok(result.includes('[REDACTED_SECRET]'));
});

test('scrubRepositoryPayload: redacts GitHub Personal Access Tokens (ghp_)', () => {
  // ghp_ prefix + exactly 36 chars = 40 total chars
  const input = 'ghp_' + GHP36;
  const result = scrubRepositoryPayload(input);
  assert.ok(result.includes('[REDACTED_SECRET]'));
  assert.ok(!result.includes('ghp_'));
});

test('scrubRepositoryPayload: redacts GitHub OAuth tokens (gho_)', () => {
  const input = 'gho_' + GHP36;
  const result = scrubRepositoryPayload(input);
  assert.ok(result.includes('[REDACTED_SECRET]'));
});

test('scrubRepositoryPayload: redacts GitHub Server-to-Server tokens (ghs_)', () => {
  const input = 'ghs_' + GHP36;
  const result = scrubRepositoryPayload(input);
  assert.ok(result.includes('[REDACTED_SECRET]'));
});

test('scrubRepositoryPayload: redacts GitHub User-to-Server tokens (ghu_)', () => {
  const input = 'ghu_' + GHP36;
  const result = scrubRepositoryPayload(input);
  assert.ok(result.includes('[REDACTED_SECRET]'));
});

test('scrubRepositoryPayload: redacts GitHub Refresh tokens (ghr_)', () => {
  const input = 'ghr_' + GHP36;
  const result = scrubRepositoryPayload(input);
  assert.ok(result.includes('[REDACTED_SECRET]'));
});

test('scrubRepositoryPayload: redacts JWT tokens', () => {
  const input = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
  const result = scrubRepositoryPayload(input);
  assert.ok(result.includes('[REDACTED_SECRET]'));
  assert.ok(!result.includes('eyJ'));
});

test('scrubRepositoryPayload: redacts generic API keys in assignments (20+ chars)', () => {
  // api_key: "MY_API_KEY_AAA...A" (33 chars after prefix, well over 20-min)
  const input = 'api_key: "MY_API_KEY_' + 'A'.repeat(24) + '"';
  const result = scrubRepositoryPayload(input);
  assert.ok(result.includes('[REDACTED_SECRET]'));
});

test('scrubRepositoryPayload: redacts generic secret keys in assignments', () => {
  const input = 'secret_key = "MY_SECRET_' + 'B'.repeat(25) + '"';
  const result = scrubRepositoryPayload(input);
  assert.ok(result.includes('[REDACTED_SECRET]'));
});

test('scrubRepositoryPayload: redacts bearer authorization tokens', () => {
  const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
  const result = scrubRepositoryPayload(input);
  assert.ok(result.includes('[REDACTED_SECRET]'));
});

test('scrubRepositoryPayload: does not redact short strings (below 20-char threshold)', () => {
  const input = 'short_token = "abc123"';
  const result = scrubRepositoryPayload(input);
  assert.ok(!result.includes('[REDACTED_SECRET]'));
  assert.equal(result, input);
});

test('scrubRepositoryPayload: preserves surrounding context around redacted secrets', () => {
  const token = 'ghp_' + GHP36;
  const input = `// Load your token: ${token} for auth`;
  const result = scrubRepositoryPayload(input);
  assert.ok(result.includes('// Load your token:'));
  assert.ok(result.includes('[REDACTED_SECRET]'));
  assert.ok(result.includes('for auth'));
});

test('scrubRepositoryPayload: does not redact null/undefined (returns original)', () => {
  const nullResult = scrubRepositoryPayload(null);
  assert.equal(nullResult, null);
  const undefResult = scrubRepositoryPayload(undefined);
  assert.equal(undefResult, undefined);
  const numResult = scrubRepositoryPayload(123);
  assert.equal(numResult, 123);
});

test('scrubRepositoryPayload: handles empty string', () => {
  const result = scrubRepositoryPayload('');
  assert.equal(result, '');
});

test('scrubRepositoryPayload: multiple secrets in same string are all redacted', () => {
  const token1 = 'ghp_' + GHP36;
  const token2 = 'ghs_' + GHP36;
  const input = `token1=${token1} token2=${token2}`;
  const result = scrubRepositoryPayload(input);
  const count = (result.match(/\[REDACTED_SECRET\]/g) || []).length;
  assert.equal(count, 2);
});

test('scrubRepositoryPayload: does not false-positive on invalid prefix ghx_', () => {
  const invalidToken = 'ghx_' + GHP36;
  const input = `prefix: ${invalidToken}`;
  const result = scrubRepositoryPayload(input);
  assert.ok(!result.includes('[REDACTED_SECRET]'));
  assert.equal(result, input);
});

test('scrubRepositoryPayload: code comment containing token-like text is redacted', () => {
  const input = `// TODO: set api_key = "MY_API_KEY_${'C'.repeat(24)}"`;
  const result = scrubRepositoryPayload(input);
  assert.ok(result.includes('[REDACTED_SECRET]'));
  assert.ok(!result.includes('MY_API_KEY_'));
});

test('scrubRepositoryPayload: handles very long strings without hanging', () => {
  const longCode = 'x'.repeat(100000);
  const result = scrubRepositoryPayload(longCode);
  assert.equal(result, longCode);
});

test('scrubRepositoryPayload: redacts embedded tokens within larger strings', () => {
  const token = 'ghp_' + GHP36;
  const input = `BEGIN TOKEN: ${token} END`;
  const result = scrubRepositoryPayload(input);
  assert.ok(result.includes('BEGIN TOKEN:'));
  assert.ok(result.includes('[REDACTED_SECRET]'));
  assert.ok(result.includes('END'));
  assert.ok(!result.includes('ghp_'));
});

test('scrubRepositoryPayload: case-insensitive bearer token matching', () => {
  const input = 'authorization: bearer ' + 'D'.repeat(40);
  const result = scrubRepositoryPayload(input);
  assert.ok(result.includes('[REDACTED_SECRET]'));
});
