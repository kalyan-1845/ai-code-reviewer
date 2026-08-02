import test from 'node:test';
import assert from 'node:assert/strict';
import { globToRegex } from '../utils/globToRegex.js';

test('globToRegex: handles single wildcard *', () => {
  const regex = globToRegex('*.js');
  assert.equal(regex.test('index.js'), true);
  assert.equal(regex.test('src/index.js'), false);
});

test('globToRegex: handles question mark ?', () => {
  const regex = globToRegex('file?.js');
  assert.equal(regex.test('file1.js'), true);
  assert.equal(regex.test('file12.js'), false);
});

test('globToRegex: handles globstar **/ correctly without over-matching or required slash', () => {
  const regex = globToRegex('src/**/*.js');
  assert.equal(regex.test('src/index.js'), true);
  assert.equal(regex.test('src/utils/math.js'), true);
  assert.equal(regex.test('src/utils/deep/helper.js'), true);
  assert.equal(regex.test('other/index.js'), false);
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { globToRegex } from '../utils/globToRegex.js';

describe('globToRegex', () => {
  it('anchors the regex with ^ and $', () => {
    const regex = globToRegex('src/app.js');
    assert.equal(regex.test('xsrc/app.jsx'), false);
    assert.equal(regex.test('src/app.js'), true);
  });

  it('converts single star to match anything except /', () => {
    const regex = globToRegex('src/*.js');
    assert.equal(regex.test('src/app.js'), true);
    assert.equal(regex.test('src/utils/helper.js'), false);
    assert.equal(regex.test('src/main.js'), true);
  });

  it('converts single star at the end to match files in a directory', () => {
    const regex = globToRegex('src/*.py');
    assert.equal(regex.test('src/main.py'), true);
    assert.equal(regex.test('src/nested/main.py'), false);
  });

  it('converts double star to match recursively', () => {
    const regex = globToRegex('src/**/*.ts');
    assert.equal(regex.test('src/app.ts'), true);
    assert.equal(regex.test('src/nested/deep/app.ts'), true);
    assert.equal(regex.test('src/app.js'), false);
  });

  it('double star stops at the next slash', () => {
    const regex = globToRegex('src/**/file.js');
    assert.equal(regex.test('src/file.js'), true);
    assert.equal(regex.test('src/a/file.js'), true);
    assert.equal(regex.test('src/a/b/file.js'), true);
    assert.equal(regex.test('src/file'), false);
  });

  it('double star skips trailing slash when followed by another segment', () => {
    const regex = globToRegex('src/**/components/*.js');
    assert.equal(regex.test('src/components/Button.js'), true);
    assert.equal(regex.test('src/a/components/Button.js'), true);
  });

  it('converts ? to match any single character except /', () => {
    const regex = globToRegex('src/?.js');
    assert.equal(regex.test('src/a.js'), true);
    assert.equal(regex.test('src/1.js'), true);
    assert.equal(regex.test('src/ab.js'), false);
    assert.equal(regex.test('src/a/b.js'), false);
  });

  it('supports advanced picomatch globs', () => {
    const regex = globToRegex('src/{legacy,new}/*.[jt]s');
    assert.equal(regex.test('src/legacy/app.js'), true);
    assert.equal(regex.test('src/new/main.ts'), true);
    assert.equal(regex.test('src/legacy/style.css'), false);
  });

  it('matches nested deep paths', () => {
    const regex = globToRegex('src/nested/deep/file.js');
    assert.equal(regex.test('src/nested/deep/file.js'), true);
    assert.equal(regex.test('src/nested/deep/'), false);
    assert.equal(regex.test('xsrc/nested/deep/file.js'), false);
  });

  it('returns a RegExp instance', () => {
    const result = globToRegex('*.js');
    assert.equal(result instanceof RegExp, true);
  });
});
