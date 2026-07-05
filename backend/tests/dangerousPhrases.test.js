import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

const originalWarn = console.warn;
console.warn = () => {};

function loadDangerousPhrases() {
  const configPath = path.join(import.meta.dirname, '..', '..', 'shared-safety-config.json');
  const raw = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(raw);
}

test('DANGEROUS_PHRASES is an array', async () => {
  const config = loadDangerousPhrases();
  assert.ok(Array.isArray(config.dangerous_phrases));
});

test('DANGEROUS_PHRASES contains critical prompt injection phrases', async () => {
  const config = loadDangerousPhrases();
  const phraseSet = new Set(config.dangerous_phrases);
  assert.ok(phraseSet.has('ignore all'));
  assert.ok(phraseSet.has('ignore all previous instructions'));
  assert.ok(phraseSet.has('disregard all'));
  assert.ok(phraseSet.has('disregard all previous'));
  assert.ok(phraseSet.has('override all'));
  assert.ok(phraseSet.has('system override'));
  assert.ok(phraseSet.has('roleplay mode'));
  assert.ok(phraseSet.has('new directive'));
  assert.ok(phraseSet.has('protocol change'));
});

test('DANGEROUS_PHRASES does not contain duplicates', async () => {
  const config = loadDangerousPhrases();
  const uniqueSet = new Set(config.dangerous_phrases);
  assert.strictEqual(uniqueSet.size, config.dangerous_phrases.length);
});

test('DANGEROUS_PHRASES contains only non-empty strings', async () => {
  const config = loadDangerousPhrases();
  for (const phrase of config.dangerous_phrases) {
    assert.strictEqual(typeof phrase, 'string');
    assert.ok(phrase.length > 0);
  }
});

test('DANGEROUS_PHRASES is non-empty with substantial list', async () => {
  const config = loadDangerousPhrases();
  assert.ok(config.dangerous_phrases.length > 10);
});

test('HOMOGLYPH_MAP is a plain object', async () => {
  const config = loadDangerousPhrases();
  assert.ok(typeof config.homoglyph_map === 'object' && config.homoglyph_map !== null);
  assert.ok(!Array.isArray(config.homoglyph_map));
});

test('HOMOGLYPH_MAP contains expected cyrillic mappings', async () => {
  const config = loadDangerousPhrases();
  const map = config.homoglyph_map;
  assert.strictEqual(map['\u0430'], 'a');
  assert.strictEqual(map['\u0435'], 'e');
  assert.strictEqual(map['\u043E'], 'o');
  assert.strictEqual(map['\u0440'], 'p');
  assert.strictEqual(map['\u0441'], 'c');
});

test('HOMOGLYPH_MAP values are single latin characters', async () => {
  const config = loadDangerousPhrases();
  for (const [key, value] of Object.entries(config.homoglyph_map)) {
    assert.strictEqual(typeof value, 'string');
    assert.strictEqual(value.length, 1);
    assert.ok(/^[a-zA-Z]$/.test(value));
  }
});

test('HOMOGLYPH_MAP contains uppercase variants', async () => {
  const config = loadDangerousPhrases();
  const uppercaseKeys = Object.keys(config.homoglyph_map).filter(k => k === k.toUpperCase());
  assert.ok(uppercaseKeys.length > 0);
});

test('DANGEROUS_PHRASES covers diverse prompt injection techniques', async () => {
  const config = loadDangerousPhrases();
  const text = config.dangerous_phrases.join(' ');
  assert.ok(text.includes('ignore'));
  assert.ok(text.includes('forget'));
  assert.ok(text.includes('override'));
  assert.ok(text.includes('roleplay'));
  assert.ok(text.includes('disregard'));
});

console.warn = originalWarn;
