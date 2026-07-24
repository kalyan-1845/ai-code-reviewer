import test from 'node:test';
import assert from 'node:assert/strict';
import { globToRegex } from '../utils/globToRegex.js';

test('globToRegex: anchors pattern with ^ and $', () => {
  const regex = globToRegex('*.js');
  assert.ok(regex.source.startsWith('^'), 'must start with ^');
  assert.ok(regex.source.endsWith('$'), 'must end with $');
});

test('globToRegex: matches simple filename wildcard', () => {
  const regex = globToRegex('*.js');
  assert.ok(regex.test('app.js'));
  assert.ok(regex.test('main.js'));
  assert.ok(!regex.test('app.ts'));
  assert.ok(!regex.test('app.jsx'));
  assert.ok(!regex.test('dir/app.js'));
});

test('globToRegex: double-star matches directories recursively', () => {
  const regex = globToRegex('**/*.js');
  assert.ok(regex.test('app.js'));
  assert.ok(regex.test('src/app.js'));
  assert.ok(regex.test('src/components/Button.js'));
  assert.ok(!regex.test('app.ts'));
});

test('globToRegex: single star does not cross directory boundaries', () => {
  const regex = globToRegex('src/*.js');
  assert.ok(regex.test('src/app.js'));
  assert.ok(!regex.test('src/components/app.js'));
  assert.ok(!regex.test('app.js'));
});

test('globToRegex: question mark matches single non-slash character', () => {
  const regex = globToRegex('file?.js');
  assert.ok(regex.test('file1.js'));
  assert.ok(regex.test('fileA.js'));
  assert.ok(!regex.test('file.js'));
  assert.ok(!regex.test('file12.js'));
  assert.ok(!regex.test('file/app.js'));
});

test('globToRegex: escapes special regex characters', () => {
  const regex = globToRegex('file[1].js');
  assert.ok(regex.test('file[1].js'));
  assert.ok(!regex.test('file1.js'));
});

test('globToRegex: mixed pattern src/**/*.js', () => {
  const regex = globToRegex('src/**/*.js');
  assert.ok(regex.test('src/app.js'));
  assert.ok(regex.test('src/lib/util.js'));
  assert.ok(regex.test('src/deep/nested/deep/file.js'));
  assert.ok(!regex.test('src/app.ts'));
  assert.ok(!regex.test('tests/app.js'));
});

test('globToRegex: pattern without wildcards matches exactly', () => {
  const regex = globToRegex('exact.js');
  assert.ok(regex.test('exact.js'));
  assert.ok(!regex.test('exact.ts'));
  assert.ok(!regex.test('sub/exact.js'));
});

test('globToRegex: pattern with directory slash', () => {
  const regex = globToRegex('src/app.js');
  assert.ok(regex.test('src/app.js'));
  assert.ok(!regex.test('src/app.ts'));
  assert.ok(!regex.test('src/lib/app.js'));
});

test('globToRegex: double-star at end matches all', () => {
  const regex = globToRegex('src/**');
  assert.ok(regex.test('src/app.js'));
  assert.ok(regex.test('src/nested/file.ts'));
  assert.ok(!regex.test('other/app.js'));
});
