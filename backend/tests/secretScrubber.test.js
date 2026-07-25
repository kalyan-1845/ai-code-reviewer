import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scrubRepositoryPayload } from '../utils/secretScrubber.js';

describe('scrubRepositoryPayload', () => {
  it('returns null unchanged', () => {
    assert.equal(scrubRepositoryPayload(null), null);
  });

  it('returns undefined unchanged', () => {
    assert.equal(scrubRepositoryPayload(undefined), undefined);
  });

  it('returns number unchanged', () => {
    assert.equal(scrubRepositoryPayload(42), 42);
  });

  it('returns object unchanged', () => {
    assert.deepEqual(scrubRepositoryPayload({ a: 1 }), { a: 1 });
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
    // GitHub PAT regex requires exactly 36 alphanumeric chars after prefix (ghp_ + 36 = 40 total)
    // Use 'token=' prefix (not underscore) so word boundary \b is satisfied before gh[pousr]_
    const pat36 = 'x'.repeat(36);
    const input = 'token=ghp_' + pat36;
    const result = scrubRepositoryPayload(input);
    assert.equal(result.includes('ghp_xxx'), false);
    assert.equal(result.includes('[REDACTED_SECRET]'), true);
  });

  it('redacts long JWT tokens', () => {
    // A valid JWT with each segment >= 10 chars (minimum required by the regex)
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const result = scrubRepositoryPayload(jwt);
    assert.equal(result.includes('[REDACTED_SECRET]'), true);
  });

  it('does not falsely match short strings as JWTs', () => {
    // A short string that looks like a JWT fragment but has fewer than 10 chars per segment
    const short = 'eyJ9.x.y';
    const result = scrubRepositoryPayload(short);
    assert.equal(result, short, 'short JWT-like strings should not be redacted');
  });

  it('redacts Bearer authorization tokens with long values', () => {
    const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnopqrstuvwxyz';
    const result = scrubRepositoryPayload(input);
    assert.equal(result.includes('[REDACTED_SECRET]'), true);
  });

  it('redacts generic api_key assignments with long values', () => {
    const input = 'const api_key = "sk_live_51234567890abcdefghij";';
    const result = scrubRepositoryPayload(input);
    assert.equal(result.includes('sk_live_51234567890abcdefghij'), false);
    assert.equal(result.includes('[REDACTED_SECRET]'), true);
  });

  it('redacts secret_key assignments with long values', () => {
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
    // PAT (ghp_ + 36 x's) and api_key value do not overlap
    const pat36 = 'x'.repeat(36);
    const apiKeyValue = 'sk_live_51234567890abcdefghij';
    const input = 'token=ghp_' + pat36 + ' apikey=' + apiKeyValue;
    const result = scrubRepositoryPayload(input);
    assert.equal(result.includes('ghp_xxx'), false);
    assert.equal(result.includes(apiKeyValue), false);
    assert.equal(result.includes('[REDACTED_SECRET]'), true);
  });

  it('redacts access_token assignments with long values', () => {
    const input = 'access_token: "ya29_abcdefghijklmnopqrstuvwxyz1234567890abcdefghijklmnopqrstuvw"';
    const result = scrubRepositoryPayload(input);
    assert.equal(result.includes('ya29_abc'), false);
    assert.equal(result.includes('[REDACTED_SECRET]'), true);
  });
});
