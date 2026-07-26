import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSafePath } from '../utils/fileHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const testBaseDir = path.join(__dirname, 'temp_safe_path_test');

test('resolveSafePath allows access to files directly inside baseDir', () => {
  const result = resolveSafePath(testBaseDir, 'file.txt');
  assert.ok(result.endsWith(path.join(testBaseDir, 'file.txt')));
});

test('resolveSafePath allows access to subdirectories', () => {
  const result = resolveSafePath(testBaseDir, 'subdir/file.txt');
  assert.ok(result.includes('subdir'));
});

test('resolveSafePath allows access to deeply nested subdirectories', () => {
  const result = resolveSafePath(testBaseDir, 'a/b/c/file.txt');
  assert.ok(result.includes('a'));
  assert.ok(result.includes('b'));
  assert.ok(result.includes('c'));
});

test('resolveSafePath rejects path traversal with ../', () => {
  assert.throws(
    () => resolveSafePath(testBaseDir, '../secret.txt'),
    /Path traversal blocked/
  );
});

test('resolveSafePath rejects deeply nested ../ sequences', () => {
  assert.throws(
    () => resolveSafePath(testBaseDir, 'subdir/../../etc/passwd'),
    /Path traversal blocked/
  );
});

test('resolveSafePath rejects absolute paths outside baseDir', () => {
  assert.throws(
    () => resolveSafePath(testBaseDir, '/etc/passwd'),
    /Path traversal blocked/
  );
});

test('resolveSafePath rejects absolute paths that bypass baseDir', () => {
  assert.throws(
    () => resolveSafePath(testBaseDir, '/home/user/../etc/passwd'),
    /Path traversal blocked/
  );
});

test('resolveSafePath handles dot paths correctly', () => {
  const result = resolveSafePath(testBaseDir, './file.txt');
  assert.ok(result.endsWith('file.txt'));
});

test('resolveSafePath handles multiple consecutive dots correctly', () => {
  const result = resolveSafePath(testBaseDir, 'dir1/./dir2/./file.txt');
  assert.ok(result.includes('dir1'));
  assert.ok(result.includes('dir2'));
});

test('resolveSafePath returns baseDir itself when targetPath is empty string', () => {
  const result = resolveSafePath(testBaseDir, '');
  assert.equal(result, path.resolve(testBaseDir));
});

test('resolveSafePath allows paths with hyphens and underscores', () => {
  const result = resolveSafePath(testBaseDir, 'my-awesome_dir/file-name.txt');
  assert.ok(result.includes('my-awesome_dir'));
});

test('resolveSafePath resolves paths correctly with varying separators', () => {
  const result = resolveSafePath(testBaseDir, 'foo/bar/baz.txt');
  assert.ok(result.endsWith(path.join('foo', 'bar', 'baz.txt')));
});
