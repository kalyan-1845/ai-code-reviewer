import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scrubRepositoryPayload } from '../utils/secretScrubber.js';

describe('scrubRepositoryPayload', () => {
  it('returns non-string inputs unchanged', () => {
    assert.equal(scrubRepositoryPayload(null), null);
    assert.equal(scrubRepositoryPayload(undefined), undefined);
    assert.equal(scrubRepositoryPayload(42), 42);
    assert.equal(scrubRepositoryPayload({}), {});
  });

  it('returns an empty string unchanged', () => {
    assert.equal(scrubRepositoryPayload(''), '');
  });

  it('redacts AWS Access Key IDs', () => {
    const input = 'AWS_KEY=AKIAIOSFODNN7EXAMPLE';
    const result = scrubRepositoryPayload(input);
    assert.equal(result.includes('AKIAIOSFODNN7EXAMPLE'), false);
    assert.equal(result.includes('[REDACTED_SECRET]'), true);
  });

  it('redacts GitHub PATs', () => {
    const input = 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
    const result = scrubRepositoryPayload(input);
    assert.equal(result.includes('ghp_xxx'), false);
    assert.equal(result.includes('[REDACTED_SECRET]'), true);
  });

  it('redacts JWT tokens', () => {
    const input = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const result = scrubRepositoryPayload(input);
    assert.equal(result.includes('eyJ'), false);
    assert.equal(result.includes('[REDACTED_SECRET]'), true);
  });

  it('redacts Bearer authorization tokens', () => {
    const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstuvwxyz';
    const result = scrubRepositoryPayload(input);
    assert.equal(result.includes('eyJ'), false);
    assert.equal(result.includes('[REDACTED_SECRET]'), true);
  });

  it('redacts generic api_key assignments', () => {
    const input = 'const api_key = "sk_live_51234567890abcdefghij";';
    const result = scrubRepositoryPayload(input);
    assert.equal(result.includes('sk_live_51234567890abcdefghij'), false);
    assert.equal(result.includes('[REDACTED_SECRET]'), true);
  });

  it('redacts secret_key assignments', () => {
    const input = 'SECRET_KEY=abcdefghijklmnopqrstuvwx';
    const result = scrubRepositoryPayload(input);
    assert.equal(result.includes('abcdefghijklmnopqrstuvwx'), false);
    assert.equal(result.includes('[REDACTED_SECRET]'), true);
  });

  it('passes through strings with no secrets unchanged', () => {
    const safe = 'const x = 42; // no secrets here';
    assert.equal(scrubRepositoryPayload(safe), safe);
  });

  it('redacts multiple secrets in the same string', () => {
    const input = 'token=ghp_aaaa&key=AKIAIOSFODNN7EXAMPLE&jwt=eyJhbGciOiJIUzI1NiJ9.eyJ9.xxxxx';
    const result = scrubRepositoryPayload(input);
    assert.equal(result.includes('ghp_aaaa'), false);
    assert.equal(result.includes('AKIAIOSFODNN7EXAMPLE'), false);
    assert.equal(result.includes('eyJ'), false);
  });

  it('redacts access_token assignments', () => {
    const input = 'access_token: "ya29.a0AfH6SMBx1234567890abcdefghijklmnopqrstuvwxyz"';
    const result = scrubRepositoryPayload(input);
    assert.equal(result.includes('ya29.a0AfH6SMBx'), false);
    assert.equal(result.includes('[REDACTED_SECRET]'), true);
  });
});
