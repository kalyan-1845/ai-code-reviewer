import test from 'node:test';
import assert from 'node:assert/strict';
import { globToRegex } from '../utils/globToRegex.js';

test('globToRegex converts wildcards and handles null inputs safely', () => {
  assert.equal(globToRegex('*.js').test('index.js'), true);
  assert.equal(globToRegex('*.js').test('index.py'), false);
  assert.equal(globToRegex('src/**/*.ts').test('src/sub/file.ts'), true);
  assert.equal(globToRegex(null).test('test'), false);
  assert.equal(globToRegex(undefined).test('test'), false);
  assert.equal(globToRegex(123).test('test'), false);
});
