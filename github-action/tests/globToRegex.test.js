import { test } from 'node:test';
import assert from 'node:assert/strict';
import { globToRegex } from '../utils/globToRegex.js';

test('globToRegex treats regex metacharacters in paths literally', () => {
  const regex = globToRegex('src/(legacy)/a+b/[draft].js');

  assert.equal(regex.test('src/(legacy)/a+b/[draft].js'), true);
  assert.equal(regex.test('src/legacy/aaab/d.js'), false);
});

test('globToRegex still supports single and double star globs', () => {
  assert.equal(globToRegex('src/*.js').test('src/app.js'), true);
  assert.equal(globToRegex('src/*.js').test('src/nested/app.js'), false);
  assert.equal(globToRegex('src/**/app.js').test('src/nested/app.js'), true);
});
