import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadIgnorePatterns, isIgnored } from '../utils/ignoreHelper.js';

async function withTempDir(fn) {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'reposage-test-'));
  try {
    return await fn(tmpDir);
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
}

test('loadIgnorePatterns returns empty array when no .reposageignore file exists', () => {
  const result = loadIgnorePatterns('/nonexistent/path');
  assert.deepEqual(result, []);
});

test('loadIgnorePatterns strips comment lines and blank lines', async () => {
  await withTempDir(async (tmpDir) => {
    const ignorePath = path.join(tmpDir, '.reposageignore');
    await fs.promises.writeFile(ignorePath, '# comment\n*.log\n\nbuild/\n');
    const result = loadIgnorePatterns(tmpDir);
    assert.equal(result.length, 2);
    assert.ok(!result.includes('# comment'));
    assert.ok(result.includes('*.log'));
    assert.ok(result.includes('build/'));
  });
});

test('loadIgnorePatterns trims whitespace', async () => {
  await withTempDir(async (tmpDir) => {
    const ignorePath = path.join(tmpDir, '.reposageignore');
    await fs.promises.writeFile(ignorePath, '  *.js  \n  dist/  \n');
    const result = loadIgnorePatterns(tmpDir);
    assert.equal(result[0], '*.js');
    assert.equal(result[1], 'dist/');
  });
});

test('isIgnored returns false for empty or invalid patterns', () => {
  assert.equal(isIgnored('src/app.js', null, '/repo'), false);
  assert.equal(isIgnored('src/app.js', undefined, '/repo'), false);
  assert.equal(isIgnored('src/app.js', [], '/repo'), false);
});

test('isIgnored matches trailing-slash directory patterns', async () => {
  await withTempDir(async (tmpDir) => {
    const patterns = ['build/'];
    const filePath = path.join(tmpDir, 'build', 'output.js');
    assert.equal(isIgnored(filePath, patterns, tmpDir), true);
  });
});

test('isIgnored matches glob extension patterns', async () => {
  await withTempDir(async (tmpDir) => {
    const patterns = ['*.pyc'];
    const filePath = path.join(tmpDir, 'cache', 'file.pyc');
    assert.equal(isIgnored(filePath, patterns, tmpDir), true);
  });
});

test('isIgnored matches double-star glob patterns', async () => {
  await withTempDir(async (tmpDir) => {
    const patterns = ['**/node_modules/**'];
    let filePath = path.join(tmpDir, 'node_modules', 'pkg', 'index.js');
    assert.equal(isIgnored(filePath, patterns, tmpDir), true);
    filePath = path.join(tmpDir, 'src', 'node_modules', 'lib', 'util.js');
    assert.equal(isIgnored(filePath, patterns, tmpDir), true);
  });
});

test('isIgnored matches literal path patterns', async () => {
  await withTempDir(async (tmpDir) => {
    const patterns = ['dist'];
    let filePath = path.join(tmpDir, 'dist');
    assert.equal(isIgnored(filePath, patterns, tmpDir), true);
    filePath = path.join(tmpDir, 'dist', 'bundle.js');
    assert.equal(isIgnored(filePath, patterns, tmpDir), true);
  });
});

test('isIgnored matches single-asterisk wildcard patterns', async () => {
  await withTempDir(async (tmpDir) => {
    const patterns = ['*.test.js'];
    const filePath = path.join(tmpDir, 'helpers.test.js');
    assert.equal(isIgnored(filePath, patterns, tmpDir), true);
  });
});

test('isIgnored returns false for non-matching paths', async () => {
  await withTempDir(async (tmpDir) => {
    const patterns = ['*.py'];
    const filePath = path.join(tmpDir, 'src', 'app.js');
    assert.equal(isIgnored(filePath, patterns, tmpDir), false);
  });
});

test('isIgnored handles mixed patterns from a single ignore file', async () => {
  await withTempDir(async (tmpDir) => {
    const patterns = ['*.log', 'build/', '**/node_modules/**', 'dist', '*.pyc'];
    assert.equal(isIgnored(path.join(tmpDir, 'app.log'), patterns, tmpDir), true);
    assert.equal(isIgnored(path.join(tmpDir, 'build', 'out.js'), patterns, tmpDir), true);
    assert.equal(isIgnored(path.join(tmpDir, 'src', 'node_modules', 'pkg', 'index.js'), patterns, tmpDir), true);
    assert.equal(isIgnored(path.join(tmpDir, 'dist', 'bundle.js'), patterns, tmpDir), true);
    assert.equal(isIgnored(path.join(tmpDir, 'cache.pyc'), patterns, tmpDir), true);
    assert.equal(isIgnored(path.join(tmpDir, 'src', 'app.js'), patterns, tmpDir), false);
  });
});

test('isIgnored normalizes backslashes to forward slashes', async () => {
  await withTempDir(async (tmpDir) => {
    const patterns = ['*.js'];
    const filePath = tmpDir + '\\src\\app.js';
    assert.equal(isIgnored(filePath, patterns, tmpDir), true);
  });
});

test('loadIgnorePatterns and isIgnored work together end-to-end', async () => {
  await withTempDir(async (tmpDir) => {
    const ignorePath = path.join(tmpDir, '.reposageignore');
    await fs.promises.writeFile(ignorePath, '*.log\nbuild/\n**/__pycache__/**\n');
    const patterns = loadIgnorePatterns(tmpDir);
    assert.equal(patterns.length, 3);
    assert.equal(isIgnored(path.join(tmpDir, 'server.log'), patterns, tmpDir), true);
    assert.equal(isIgnored(path.join(tmpDir, 'build', 'asset.js'), patterns, tmpDir), true);
    assert.equal(isIgnored(path.join(tmpDir, 'src', '__pycache__', 'main.cpython-312.pyc'), patterns, tmpDir), true);
    assert.equal(isIgnored(path.join(tmpDir, 'src', 'index.js'), patterns, tmpDir), false);
  });
});
