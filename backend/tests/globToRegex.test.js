import test from 'node:test';
import assert from 'node:assert/strict';
import { globToRegex } from '../utils/globToRegex.js';

test('globToRegex: simple asterisk matches files in the same directory', () => {
  const regex = globToRegex('*.js');
  assert.equal(regex.test('app.js'), true);
  assert.equal(regex.test('test.js'), true);
  assert.equal(regex.test('utils.js'), true);
  assert.equal(regex.test('app.ts'), false, '.ts should not match *.js');
  assert.equal(regex.test('src/app.js'), false, 'subdirectory should not match *.js');
});

test('globToRegex: double-asterisk matches across directories', () => {
  const regex = globToRegex('**/*.js');
  assert.equal(regex.test('app.js'), true, 'file in root');
  assert.equal(regex.test('src/nested/app.js'), true, 'file in nested directory');
  assert.equal(regex.test('src/deep/nested/app.js'), true, 'deeply nested file');
  assert.equal(regex.test('app.ts'), false, '.ts should not match');
});

test('globToRegex: double-asterisk with prefix matches subdirectories only', () => {
  const regex = globToRegex('src/**/*.js');
  assert.equal(regex.test('src/app.js'), true, 'file directly in src');
  assert.equal(regex.test('src/lib/utils.js'), true, 'file in subdirectory of src');
  assert.equal(regex.test('src/lib/nested/deep.js'), true, 'deeply nested under src');
  assert.equal(regex.test('app.js'), false, 'file not in src should not match');
  assert.equal(regex.test('packages/app.js'), false, 'different top-level dir should not match');
});

test('globToRegex: question mark matches single character', () => {
  const regex = globToRegex('file?.js');
  assert.equal(regex.test('file1.js'), true, 'digit matches ?');
  assert.equal(regex.test('fileA.js'), true, 'letter matches ?');
  assert.equal(regex.test('file.js'), false, 'no character should not match');
  assert.equal(regex.test('file12.js'), false, 'two characters should not match single ?');
});

test('globToRegex: regex metacharacters in filenames are treated literally', () => {
  const regex = globToRegex('src/(legacy)/a+b/[draft].js');
  assert.equal(regex.test('src/(legacy)/a+b/[draft].js'), true, 'parentheses and plus should be literal');
  assert.equal(regex.test('src/legacy/aaab/d.js'), false, 'should not interpret as regex');
});

test('globToRegex: escaped special characters are matched literally', () => {
  // Pattern includes characters that would be special in regex
  const regex = globToRegex('src/app[123].js');
  assert.equal(regex.test('src/app[123].js'), true, 'brackets should be literal');
  assert.equal(regex.test('src/app999.js'), false, 'different content should not match');
});

test('globToRegex: empty pattern produces regex matching only empty string', () => {
  const regex = globToRegex('');
  assert.equal(regex.test(''), true, 'empty string should match empty pattern');
  assert.equal(regex.test('x'), false, 'non-empty should not match');
});

test('globToRegex: directory with slash is handled correctly', () => {
  const regex = globToRegex('src/');
  assert.equal(regex.test('src/'), true, 'trailing slash should match');
});

test('globToRegex: mixed patterns work correctly', () => {
  const regex = globToRegex('src/**/*.test.js');
  assert.equal(regex.test('src/app.test.js'), true);
  assert.equal(regex.test('src/lib/app.test.js'), true);
  assert.equal(regex.test('src/lib/nested/app.test.js'), true);
  assert.equal(regex.test('src/app.spec.js'), false, '.spec should not match .test');
  assert.equal(regex.test('app.test.js'), false, 'file outside src should not match');
});

test('globToRegex: star does not match path separator', () => {
  const regex = globToRegex('src/*.js');
  assert.equal(regex.test('src/app.js'), true, 'file directly in src');
  assert.equal(regex.test('src/lib/app.js'), false, 'file in subdirectory should not match single *');
});

test('globToRegex: double-star at boundary matches across slash', () => {
  const regex = globToRegex('**/node_modules/**');
  assert.equal(regex.test('node_modules/pkg/index.js'), true);
  assert.equal(regex.test('src/node_modules/pkg/index.js'), true);
  assert.equal(regex.test('pkg/index.js'), false, 'should not match without node_modules prefix');
});
