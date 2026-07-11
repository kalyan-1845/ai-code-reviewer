import test from 'node:test';
import assert from 'node:assert/strict';

// Replicate the normalizeHomoglyphs logic from backend/index.js for isolated testing.
// This mirrors the implementation in the app module (line 193-196 of index.js).

const HOMOGLYPH_MAP = {
  '\u0430': 'a', '\u0435': 'e', '\u043e': 'o', '\u0441': 'c', '\u0440': 'p',
  '\u0445': 'x', '\u0443': 'y', '\u0432': 'b', '\u043D': 'h', '\u0431': 'k',
  '\u043C': 'm', '\u0438': 'i', '\u0428': 'W', '\u03bf': 'o', '\u03b5': 'e', '\u03b1': 'a'
};

function normalizeHomoglyphs(text) {
  return text.split('').map(ch => HOMOGLYPH_MAP[ch] || ch).join('');
}

// --- Tests ---

test('normalizeHomoglyphs normalizes Cyrillic letters', () => {
  assert.equal(normalizeHomoglyphs('\u0430'), 'a');
  assert.equal(normalizeHomoglyphs('\u0435'), 'e');
  assert.equal(normalizeHomoglyphs('\u043e'), 'o');
  assert.equal(normalizeHomoglyphs('\u0441'), 'c');
  assert.equal(normalizeHomoglyphs('\u0440'), 'p');
  assert.equal(normalizeHomoglyphs('\u0445'), 'x');
  assert.equal(normalizeHomoglyphs('\u0443'), 'y');
  assert.equal(normalizeHomoglyphs('\u0432'), 'b');
  assert.equal(normalizeHomoglyphs('\u043d'), 'h');
  assert.equal(normalizeHomoglyphs('\u0431'), 'k');
  assert.equal(normalizeHomoglyphs('\u043c'), 'm');
  assert.equal(normalizeHomoglyphs('\u0438'), 'i');
});

test('normalizeHomoglyphs normalizes Greek homoglyphs', () => {
  assert.equal(normalizeHomoglyphs('\u03bf'), 'o');  // Greek omicron
  assert.equal(normalizeHomoglyphs('\u03b5'), 'e'); // Greek epsilon
  assert.equal(normalizeHomoglyphs('\u03b1'), 'a'); // Greek alpha
});

test('normalizeHomoglyphs normalizes Cyrillic Ш to W', () => {
  // \u0428 is Cyrillic capital SHA
  assert.equal(normalizeHomoglyphs('\u0428'), 'W');
});

test('normalizeHomoglyphs preserves non-homoglyph characters', () => {
  const result = normalizeHomoglyphs('hello world!@#$%^&*()');
  assert.equal(result, 'hello world!@#$%^&*()');
});

test('normalizeHomoglyphs normalizes mixed ASCII and Cyrillic', () => {
  // "p\u0430ssword" looks like "password" when using Cyrillic а
  const result = normalizeHomoglyphs('p\u0430ssword');
  assert.equal(result, 'password');
});

test('normalizeHomoglyphs normalizes mixed Greek and Latin', () => {
  // "h\u03b5llo" looks like "hello"
  const result = normalizeHomoglyphs('h\u03b5llo');
  assert.equal(result, 'hello');
});

test('normalizeHomoglyphs returns empty string for empty input', () => {
  assert.equal(normalizeHomoglyphs(''), '');
});

test('normalizeHomoglyphs normalizes full Cyrillic words', () => {
  // "\u0440\u0438\u0432\u0435\u0442" (Cyrillic "privet" / hello)
  const result = normalizeHomoglyphs('\u0440\u0438\u0432\u0435\u0442');
  assert.equal(result[0], 'p'); // \u0440 -> p
  assert.equal(result.includes('\u0440'), false, 'Cyrillic р should be replaced');
});

test('normalizeHomoglyphs passes through Chinese characters unchanged', () => {
  const result = normalizeHomoglyphs('\u4e2d\u6587\u6d88\u606f');
  assert.equal(result, '\u4e2d\u6587\u6d88\u606f');
});

test('normalizeHomoglyphs passes through numbers unchanged', () => {
  assert.equal(normalizeHomoglyphs('1234567890'), '1234567890');
});

test('normalizeHomoglyphs passes through whitespace unchanged', () => {
  assert.equal(normalizeHomoglyphs('  \t\n  '), '  \t\n  ');
});

test('normalizeHomoglyphs is idempotent when applied twice', () => {
  const original = 'p\u0430ssw\u043erd123';
  const once = normalizeHomoglyphs(original);
  const twice = normalizeHomoglyphs(once);
  assert.equal(once, twice, 'Applying normalizeHomoglyphs twice should return the same result');
});

test('normalizeHomoglyphs handles characters not in HOMOGLYPH_MAP', () => {
  // Cyrillic capital O (О, U+041E) is not in the map, should pass through
  assert.equal(normalizeHomoglyphs('\u041e'), '\u041e');
  // Latin Capital O should be preserved as-is
  assert.equal(normalizeHomoglyphs('O'), 'O');
});
