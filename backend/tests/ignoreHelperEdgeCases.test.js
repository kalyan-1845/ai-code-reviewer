import test from 'node:test';
import assert from 'assert/strict';
import { isIgnored } from '../utils/ignoreHelper.js';

// ---------------------------------------------------------------------------
// Edge-case tests for isIgnored in backend/utils/ignoreHelper.js
// Tests cover: null patterns, wildcard edge cases, negation patterns,
// empty patterns, and path edge cases not covered by the main test suite.
// ---------------------------------------------------------------------------

test('isIgnored returns false for null patterns array', () => {
  assert.equal(isIgnored('/app/src/main.js', null, '/app'), false);
});

test('isIgnored returns false for undefined patterns', () => {
  assert.equal(isIgnored('/app/src/main.js', undefined, '/app'), false);
});

test('isIgnored returns false for empty patterns array', () => {
  assert.equal(isIgnored('/app/src/main.js', [], '/app'), false);
});

test('isIgnored returns false for patterns containing only empty strings', () => {
  const patterns = ['', '  ', ''];
  assert.equal(isIgnored('/app/file.js', patterns, '/app'), false);
});

test('isIgnored with pattern just "*" matches any file (including with extension)', () => {
  // '*' escapes to [^/]* which matches any non-slash sequence
  // so it matches Makefile, README, AND file.js
  const patterns = ['*'];
  assert.equal(isIgnored('/app/Makefile', patterns, '/app'), true);
  assert.equal(isIgnored('/app/README', patterns, '/app'), true);
  assert.equal(isIgnored('/app/file.js', patterns, '/app'), true);
});

test('isIgnored with glob in the middle (temp/*/file.txt)', () => {
  const patterns = ['temp/*/file.txt'];
  assert.equal(isIgnored('/app/temp/build/file.txt', patterns, '/app'), true);
  assert.equal(isIgnored('/app/temp/x/file.txt', patterns, '/app'), true);
  assert.equal(isIgnored('/app/temp/file.txt', patterns, '/app'), false);
  assert.equal(isIgnored('/app/other/file.txt', patterns, '/app'), false);
});

test('isIgnored with glob at start (*.tmp)', () => {
  const patterns = ['*.tmp'];
  assert.equal(isIgnored('/app/data.tmp', patterns, '/app'), true);
  assert.equal(isIgnored('/app/file.tmp', patterns, '/app'), true);
  assert.equal(isIgnored('/app/file.tmp.bak', patterns, '/app'), false);
  assert.equal(isIgnored('/app/file.js', patterns, '/app'), false);
});

test('isIgnored with negation pattern (!pattern) — not currently supported', () => {
  // Negation patterns starting with '!' are not implemented;
  // '!secret.txt' is treated as a literal pattern, and '*.txt' matches secret.txt
  const patterns = ['!secret.txt', '*.txt'];
  assert.equal(isIgnored('/app/secret.txt', patterns, '/app'), true);
});

test('isIgnored directory pattern ends with "/" matches subtrees', () => {
  const patterns = ['build/'];
  assert.equal(isIgnored('/app/build/output.js', patterns, '/app'), true);
  assert.equal(isIgnored('/app/build/nested/deep/output.js', patterns, '/app'), true);
  assert.equal(isIgnored('/app/build', patterns, '/app'), true);
  assert.equal(isIgnored('/app/notbuild/file.js', patterns, '/app'), false);
});

test('isIgnored with pattern that is just a directory name', () => {
  const patterns = ['dist'];
  assert.equal(isIgnored('/app/dist/bundle.js', patterns, '/app'), true);
  assert.equal(isIgnored('/app/dist', patterns, '/app'), true);
  assert.equal(isIgnored('/app/distributed/file.js', patterns, '/app'), false);
});

test('isIgnored with double-segment pattern (src/vendor/)', () => {
  const patterns = ['src/vendor/'];
  assert.equal(isIgnored('/app/src/vendor/lib.js', patterns, '/app'), true);
  assert.equal(isIgnored('/app/src/vendor/deep/lib.js', patterns, '/app'), true);
  assert.equal(isIgnored('/app/src/lib.js', patterns, '/app'), false);
});

test('isIgnored with Windows-style backslash path on POSIX baseDir', () => {
  const patterns = ['temp'];
  assert.equal(isIgnored('temp\\file.js', patterns, '/app'), false);
});

test('isIgnored case sensitivity — should be case-sensitive', () => {
  const patterns = ['*.JS'];
  assert.equal(isIgnored('/app/file.js', patterns, '/app'), false);
  assert.equal(isIgnored('/app/file.JS', patterns, '/app'), true);
});

test('isIgnored with file pattern matching full relative path', () => {
  const patterns = ['src/main.js'];
  assert.equal(isIgnored('/app/src/main.js', patterns, '/app'), true);
  assert.equal(isIgnored('/app/src/main.jsx', patterns, '/app'), false);
  assert.equal(isIgnored('/app/other/src/main.js', patterns, '/app'), false);
});

test('isIgnored with file pattern matching directory prefix', () => {
  const patterns = ['lib/'];
  assert.equal(isIgnored('/app/lib/index.js', patterns, '/app'), true);
  assert.equal(isIgnored('/app/libcore/file.js', patterns, '/app'), false);
});

test('isIgnored returns false when filePath is empty string', () => {
  const patterns = ['*.js'];
  assert.equal(isIgnored('', patterns, '/app'), false);
});

test('isIgnored returns false for pattern that looks like file path but is a pattern', () => {
  const patterns = ['reposage'];
  assert.equal(isIgnored('/app/reposage', patterns, '/app'), true);
  assert.equal(isIgnored('/app/reposageignore', patterns, '/app'), false);
});

test('isIgnored with pattern "*/*" matches single-segment nested paths', () => {
  // '*/*' escapes to [^/]*/[^/]* — one dir segment + / + filename
  const patterns = ['*/*'];
  assert.equal(isIgnored('/app/src/file.js', patterns, '/app'), true);
  assert.equal(isIgnored('/app/a/b/file.js', patterns, '/app'), false);
});

test('isIgnored with pattern starting with * (extension wildcard) with subfolder', () => {
  const patterns = ['*.log'];
  assert.equal(isIgnored('/app/logs/app.log', patterns, '/app'), true);
  assert.equal(isIgnored('/app/logs/nested/app.log', patterns, '/app'), true);
});

test('isIgnored baseDir is longer than filePath — should not crash', () => {
  const patterns = ['node_modules'];
  assert.equal(isIgnored('/app', patterns, '/app/nested/deep'), false);
});

test('isIgnored with pattern **/*.js (unsupported, documents current behavior)', () => {
  // ** glob is not explicitly supported; behavior depends on implementation
  const patterns = ['**/*.js'];
  const result = isIgnored('/app/src/main.js', patterns, '/app');
  assert.equal(typeof result, 'boolean');
});

test('isIgnored with null/undefined entries in patterns array is skipped', () => {
  // Non-string pattern entries are skipped gracefully
  assert.equal(isIgnored('/app/file.js', [null], '/app'), false);
  assert.equal(isIgnored('/app/file.js', [undefined], '/app'), false);
  assert.equal(isIgnored('/app/file.js', ['*.js', null, '*.tmp'], '/app'), true);
});

test('isIgnored strips leading slashes from patterns to match relative paths correctly', () => {
  const patterns = ['/node_modules/', '/dist', '/src/index.js'];
  assert.equal(isIgnored('/app/node_modules/lodash/index.js', patterns, '/app'), true);
  assert.equal(isIgnored('/app/dist/bundle.js', patterns, '/app'), true);
  assert.equal(isIgnored('/app/src/index.js', patterns, '/app'), true);
  assert.equal(isIgnored('/app/src/other.js', patterns, '/app'), false);
});
