import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Mock fs so parseIgnoreFile reads from a temp fixture.
// ---------------------------------------------------------------------------
const FIXTURE_PATH = path.join(__dirname, 'reposageIgnore.fixture');
const ORIGINAL_READ_FILE_SYNC = fs.readFileSync;
const ORIGINAL_EXISTS_SYNC = fs.existsSync;

function withIgnoreFile(content, fn) {
  fs.existsSync = (p) => p === FIXTURE_PATH ? true : ORIGINAL_EXISTS_SYNC(p);
  fs.readFileSync = (p) => p === FIXTURE_PATH ? content : ORIGINAL_READ_FILE_SYNC(p);
  try {
    return fn();
  } finally {
    fs.existsSync = ORIGINAL_EXISTS_SYNC;
    fs.readFileSync = ORIGINAL_READ_FILE_SYNC;
  }
}

import { parseIgnoreFile, shouldIgnore } from '../utils/reposageIgnore.js';

test('reposageIgnore: parseIgnoreFile returns empty array when file does not exist', () => {
  fs.existsSync = (p) => p !== FIXTURE_PATH ? ORIGINAL_EXISTS_SYNC(p) : false;
  const result = parseIgnoreFile(FIXTURE_PATH);
  assert.deepEqual(result, []);
  fs.existsSync = ORIGINAL_EXISTS_SYNC;
});

test('reposageIgnore: parseIgnoreFile skips blank lines and comments', () => {
  const content = '# This is a comment\n\n  \n# Another comment\n';
  withIgnoreFile(content, () => {
    const patterns = parseIgnoreFile(FIXTURE_PATH);
    assert.deepEqual(patterns, [], 'blank lines and comments should be skipped');
  });
});

test('reposageIgnore: parseIgnoreFile returns non-comment, non-blank lines as patterns', () => {
  const content = '# comment\nnode_modules/\n*.log\ndist/\n';
  withIgnoreFile(content, () => {
    const patterns = parseIgnoreFile(FIXTURE_PATH);
    assert.deepEqual(patterns, ['node_modules/', '*.log', 'dist/']);
  });
});

test('reposageIgnore: parseIgnoreFile trims whitespace from each line', () => {
  const content = '  *.tmp  \n  .env  \n';
  withIgnoreFile(content, () => {
    const patterns = parseIgnoreFile(FIXTURE_PATH);
    assert.deepEqual(patterns, ['*.tmp', '.env']);
  });
});

test('reposageIgnore: shouldIgnore returns false when no .reposageignore exists', () => {
  const fakeRoot = path.join(__dirname, 'no-such-root');
  fs.existsSync = (p) => p !== path.join(fakeRoot, '.reposageignore') && p !== FIXTURE_PATH ? ORIGINAL_EXISTS_SYNC(p) : false;
  fs.readFileSync = (p) => p !== FIXTURE_PATH ? ORIGINAL_READ_FILE_SYNC(p) : { throw: 'not called' };
  const result = shouldIgnore('src/index.js', fakeRoot);
  fs.existsSync = ORIGINAL_EXISTS_SYNC;
  fs.readFileSync = ORIGINAL_READ_FILE_SYNC;
  assert.equal(result, false, 'should return false when no ignore file exists');
});

test('reposageIgnore: shouldIgnore matches exact file paths against patterns', () => {
  const content = 'node_modules/\n*.log\n';
  withIgnoreFile(content, () => {
    // The repoRoot used here is __dirname which is backend/tests/
    // The ignore file fixture is at FIXTURE_PATH = backend/tests/reposageIgnore.fixture
    // We need to test the pattern matching directly — set up fixture properly
    const repoRoot = __dirname;
    fs.existsSync = (p) => p === path.join(repoRoot, '.reposageignore') ? true : ORIGINAL_EXISTS_SYNC(p);
    fs.readFileSync = (p) => p === path.join(repoRoot, '.reposageignore') ? content : ORIGINAL_READ_FILE_SYNC(p);

    assert.equal(shouldIgnore('node_modules/package/index.js', repoRoot), true, 'should ignore node_modules files');
    assert.equal(shouldIgnore('error.log', repoRoot), true, 'should ignore *.log files');
    assert.equal(shouldIgnore('src/index.js', repoRoot), false, 'should not ignore src files');
    assert.equal(shouldIgnore('src/index.log', repoRoot), true, '*.log matches any path ending in .log');
    fs.existsSync = ORIGINAL_EXISTS_SYNC;
    fs.readFileSync = ORIGINAL_READ_FILE_SYNC;
  });
});

test('reposageIgnore: shouldIgnore handles ** for recursive matching', () => {
  const content = '**/*.bak\n**/test/**\n';
  withIgnoreFile(content, () => {
    const repoRoot = __dirname;
    fs.existsSync = (p) => p === path.join(repoRoot, '.reposageignore') ? true : ORIGINAL_EXISTS_SYNC(p);
    fs.readFileSync = (p) => p === path.join(repoRoot, '.reposageignore') ? content : ORIGINAL_READ_FILE_SYNC(p);
    assert.equal(shouldIgnore('old/file.bak', repoRoot), true, '**/*.bak matches any path ending in .bak');
    assert.equal(shouldIgnore('deep/nested/test/helper.js', repoRoot), true, '**/test/** matches any path containing test/');
    assert.equal(shouldIgnore('src/main.js', repoRoot), false, 'should not match unrelated files');
    fs.existsSync = ORIGINAL_EXISTS_SYNC;
    fs.readFileSync = ORIGINAL_READ_FILE_SYNC;
  });
});

test('reposageIgnore: shouldIgnore handles trailing / for directory-only patterns', () => {
  const content = 'node_modules/\n__pycache__/\n';
  withIgnoreFile(content, () => {
    const repoRoot = __dirname;
    fs.existsSync = (p) => p === path.join(repoRoot, '.reposageignore') ? true : ORIGINAL_EXISTS_SYNC(p);
    fs.readFileSync = (p) => p === path.join(repoRoot, '.reposageignore') ? content : ORIGINAL_READ_FILE_SYNC(p);
    assert.equal(shouldIgnore('node_modules/lodash/index.js', repoRoot), true, 'node_modules/ directory match');
    assert.equal(shouldIgnore('__pycache__/module.pyc', repoRoot), true, '__pycache__/ directory match');
    assert.equal(shouldIgnore('src/node_modules/helper.js', repoRoot), true, 'should match files under node_modules subdirectory');
    fs.existsSync = ORIGINAL_EXISTS_SYNC;
    fs.readFileSync = ORIGINAL_READ_FILE_SYNC;
  });
});
