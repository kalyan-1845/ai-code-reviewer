import { test, describe } from 'node:test';
import assert from 'node:assert';
import { globToRegex } from '../utils/globToRegex.js';

describe('globToRegex', () => {
  test('simple patterns', () => {
    const regex = globToRegex('*.js');
    assert.strictEqual(regex.test('app.js'), true);
    assert.strictEqual(regex.test('test.js'), true);
    assert.strictEqual(regex.test('utils.js'), true);
    assert.strictEqual(regex.test('app.ts'), false);
  });

  test('double-star', () => {
    const regex = globToRegex('**/*.js');
    assert.strictEqual(regex.test('app.js'), true);
    assert.strictEqual(regex.test('src/nested/app.js'), true);
    assert.strictEqual(regex.test('src/deep/nested/app.js'), true);
  });

  test('double-star across slash', () => {
    const regex = globToRegex('src/**/*.js');
    assert.strictEqual(regex.test('src/app.js'), true);
    assert.strictEqual(regex.test('src/a/b/app.js'), true);
    assert.strictEqual(regex.test('app.js'), false);
  });

  test('question mark', () => {
    const regex = globToRegex('file?.js');
    assert.strictEqual(regex.test('file1.js'), true);
    assert.strictEqual(regex.test('fileA.js'), true);
    assert.strictEqual(regex.test('file12.js'), false);
  });

  test('literal special chars', () => {
    const regex = globToRegex('file(1).js');
    assert.strictEqual(regex.test('file(1).js'), true);
  });

  test('escaped special chars', () => {
    const regex = globToRegex('file\\(1\\).js');
    assert.strictEqual(regex.test('file(1).js'), true);
  });

  test('empty pattern', () => {
    const regex = globToRegex('');
    assert.strictEqual(regex.test(''), true);
    assert.strictEqual(regex.test('a'), false);
  });
});
