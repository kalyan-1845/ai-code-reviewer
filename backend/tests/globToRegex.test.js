import test from 'node:test';
import assert from 'node:assert/strict';
import { globToRegex } from '../utils/globToRegex.js';

test('globToRegex: simple * matches files matching the pattern', () => {
  const re = globToRegex('*.js');
  assert.ok(re.test('app.js'));
  assert.ok(re.test('test.js'));
  assert.ok(re.test('utils.js'));
  assert.ok(re.test('a.js'));
});

test('globToRegex: simple * does not match non-matching patterns', () => {
  const re = globToRegex('*.js');
  assert.ok(!re.test('app.ts'));
  assert.ok(!re.test('app.jsx'));
  assert.ok(!re.test('foo/bar.js'));
});

test('globToRegex: ** matches across directory slashes', () => {
  const re = globToRegex('**/*.js');
  assert.ok(re.test('app.js'));
  assert.ok(re.test('foo/bar.js'));
  assert.ok(re.test('foo/bar/baz.js'));
  assert.ok(re.test('a/b/c/d/e.js'));
});

test('globToRegex: ** at start matches any prefix', () => {
  const re = globToRegex('**/file.txt');
  assert.ok(re.test('file.txt'));
  assert.ok(re.test('foo/file.txt'));
  assert.ok(re.test('foo/bar/file.txt'));
});

test('globToRegex: ** with directory prefix', () => {
  const re = globToRegex('src/**/*.js');
  assert.ok(re.test('src/app.js'));
  assert.ok(re.test('src/utils/app.js'));
  assert.ok(re.test('src/foo/bar/baz.js'));
  assert.ok(!re.test('app.js'));
  assert.ok(!re.test('lib/app.js'));
});

test('globToRegex: ** across slash boundary', () => {
  const re = globToRegex('foo/**/bar');
  assert.ok(re.test('foo/bar'));
  assert.ok(re.test('foo/a/bar'));
  assert.ok(re.test('foo/a/b/bar'));
  assert.ok(!re.test('foo/baz'));
});

test('globToRegex: ** alone matches any path', () => {
  const re = globToRegex('**');
  assert.ok(re.test('anything'));
  assert.ok(re.test('foo/bar/baz'));
  assert.ok(re.test(''));
});

test('globToRegex: single * does not match across slashes', () => {
  const re = globToRegex('src/*.js');
  assert.ok(re.test('src/app.js'));
  assert.ok(!re.test('src/utils/app.js'));
  assert.ok(!re.test('src/app'));
});

test('globToRegex: ? matches any single character except /', () => {
  const re = globToRegex('file?.js');
  assert.ok(re.test('file1.js'));
  assert.ok(re.test('fileA.js'));
  assert.ok(re.test('fileX.js'));
  assert.ok(!re.test('file12.js'));
  assert.ok(!re.test('file.js'));
  assert.ok(!re.test('file/foo.js'));
});

test('globToRegex: ? does not match /', () => {
  const re = globToRegex('src/??.js');
  assert.ok(re.test('src/ab.js'));
  assert.ok(!re.test('src/a.js'));
});

test('globToRegex: special regex characters are escaped', () => {
  const re = globToRegex('.gitignore');
  assert.ok(re.test('.gitignore'));
  assert.ok(!re.test('agirignore'));
  assert.ok(!re.test('xgitignore'));
});

test('globToRegex: . in pattern is escaped', () => {
  const re = globToRegex('*.config.js');
  assert.ok(re.test('app.config.js'));
  assert.ok(!re.test('app config.js'));
  assert.ok(!re.test('appxconfig.js'));
});

test('globToRegex: patterns are anchored at start and end', () => {
  const re = globToRegex('*.js');
  assert.ok(!re.test('app.js.extra'));
  assert.ok(!re.test('prefix/app.js'));
  assert.ok(re.test('app.js'));
});

test('globToRegex: directory separator / is matched literally', () => {
  const re = globToRegex('src/utils/*.js');
  assert.ok(re.test('src/utils/app.js'));
  assert.ok(!re.test('src-utils/app.js'));
  assert.ok(!re.test('src/utilsapp.js'));
});

test('globToRegex: complex nested pattern', () => {
  const re = globToRegex('packages/*/src/**/*.ts');
  assert.ok(re.test('packages/core/src/index.ts'));
  assert.ok(re.test('packages/core/src/lib/util.ts'));
  assert.ok(re.test('packages/core/src/a/b/c.ts'));
  assert.ok(!re.test('packages/core/lib/index.ts'));
  assert.ok(!re.test('packages/core/src/index.js'));
});
