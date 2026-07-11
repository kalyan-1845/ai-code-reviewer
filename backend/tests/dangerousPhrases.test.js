import test from 'node:test';
import assert from 'node:assert/strict';
import { DANGEROUS_PHRASES } from '../shared/dangerousPhrases.js';

test('DANGEROUS_PHRASES is an array', () => {
  assert.ok(Array.isArray(DANGEROUS_PHRASES));
});

test('DANGEROUS_PHRASES has more than 20 entries', () => {
  assert.ok(DANGEROUS_PHRASES.length > 20, `Expected > 20 phrases, got ${DANGEROUS_PHRASES.length}`);
});

test('DANGEROUS_PHRASES contains known critical phrases', () => {
  assert.ok(DANGEROUS_PHRASES.includes('ignore all previous instructions'));
  assert.ok(DANGEROUS_PHRASES.includes('ignore all'));
  assert.ok(DANGEROUS_PHRASES.includes('disregard all'));
  assert.ok(DANGEROUS_PHRASES.includes('override all'));
  assert.ok(DANGEROUS_PHRASES.includes('forget all'));
});

test('DANGEROUS_PHRASES contains system override phrases', () => {
  assert.ok(DANGEROUS_PHRASES.includes('system override'));
  assert.ok(DANGEROUS_PHRASES.includes('override protocol'));
});

test('DANGEROUS_PHRASES contains roleplay and directive phrases', () => {
  assert.ok(DANGEROUS_PHRASES.includes('roleplay mode'));
  assert.ok(DANGEROUS_PHRASES.includes('new directive'));
  assert.ok(DANGEROUS_PHRASES.includes('protocol change'));
});

test('DANGEROUS_PHRASES contains impersonation phrases', () => {
  assert.ok(DANGEROUS_PHRASES.includes('you are not'));
  assert.ok(DANGEROUS_PHRASES.includes('you will now'));
  assert.ok(DANGEROUS_PHRASES.includes('you have been'));
});

test('DANGEROUS_PHRASES contains bypass and breach phrases', () => {
  assert.ok(DANGEROUS_PHRASES.includes('disobey'));
  assert.ok(DANGEROUS_PHRASES.includes('unauthorized'));
  assert.ok(DANGEROUS_PHRASES.includes('breach'));
  assert.ok(DANGEROUS_PHRASES.includes('bypass'));
});

test('DANGEROUS_PHRASES contains dismiss phrases', () => {
  assert.ok(DANGEROUS_PHRASES.includes('disregard'));
  assert.ok(DANGEROUS_PHRASES.includes('disregard all'));
  assert.ok(DANGEROUS_PHRASES.includes('disregard all previous'));
});

test('DANGEROUS_PHRASES contains instruction override phrases', () => {
  assert.ok(DANGEROUS_PHRASES.includes('ignore previous'));
  assert.ok(DANGEROUS_PHRASES.includes('ignore above'));
  assert.ok(DANGEROUS_PHRASES.includes('ignore the above'));
  assert.ok(DANGEROUS_PHRASES.includes('ignore previous instructions'));
});

test('DANGEROUS_PHRASES contains forget memory phrases', () => {
  assert.ok(DANGEROUS_PHRASES.includes('forget previous'));
  assert.ok(DANGEROUS_PHRASES.includes('forget your'));
});

test('DANGEROUS_PHRASES contains dismiss instruction phrases', () => {
  assert.ok(DANGEROUS_PHRASES.includes('do not follow'));
  assert.ok(DANGEROUS_PHRASES.includes('instead follow'));
  assert.ok(DANGEROUS_PHRASES.includes('replace all'));
});

test('DANGEROUS_PHRASES contains from now on phrase', () => {
  assert.ok(DANGEROUS_PHRASES.includes('from now on'));
});

test('DANGEROUS_PHRASES contains "you are programmed" phrase', () => {
  assert.ok(DANGEROUS_PHRASES.includes('you are programmed'));
});

test('DANGEROUS_PHRASES contains "your true purpose" phrase', () => {
  assert.ok(DANGEROUS_PHRASES.includes('your true purpose'));
});

test('DANGEROUS_PHRASES contains "listen to me" phrase', () => {
  assert.ok(DANGEROUS_PHRASES.includes('listen to me'));
});

test('DANGEROUS_PHRASES contains "disable all" phrase', () => {
  assert.ok(DANGEROUS_PHRASES.includes('disable all'));
});

test('DANGEROUS_PHRASES contains "real instruction" and "actual instruction" phrases', () => {
  assert.ok(DANGEROUS_PHRASES.includes('real instruction'));
  assert.ok(DANGEROUS_PHRASES.includes('actual instruction'));
});

test('all DANGEROUS_PHRASES entries are non-empty strings', () => {
  for (const phrase of DANGEROUS_PHRASES) {
    assert.equal(typeof phrase, 'string', `"${phrase}" should be a string`);
    assert.ok(phrase.trim().length > 0, `"${phrase}" should not be empty`);
  }
});

test('DANGEROUS_PHRASES has no duplicate entries', () => {
  const seen = new Set();
  for (const phrase of DANGEROUS_PHRASES) {
    assert.ok(!seen.has(phrase), `Duplicate phrase found: "${phrase}"`);
    seen.add(phrase);
  }
});

test('DANGEROUS_PHRASES entries are lowercase or mixed case', () => {
  for (const phrase of DANGEROUS_PHRASES) {
    // Entries should have meaningful content (not just symbols/numbers)
    assert.ok(phrase.length >= 3, `"${phrase}" should be at least 3 characters`);
  }
});

test('DANGEROUS_PHRASES does not contain undefined or null', () => {
  assert.ok(!DANGEROUS_PHRASES.includes(undefined));
  assert.ok(!DANGEROUS_PHRASES.includes(null));
});
