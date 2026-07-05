import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseIgnoreFile, shouldIgnore } from '../utils/reposageIgnore.js';

async function withTempDir(fn) {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'reposage-test-'));
  try {
    return await fn(tmpDir);
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
}

test('parseIgnoreFile returns empty array for non-existent file path', async () => {
  const result = parseIgnoreFile('/nonexistent/path/.reposageignore');
  assert.deepEqual(result, []);
});

test('parseIgnoreFile strips comment lines starting with #', async () => {
  await withTempDir(async (tmpDir) => {
    const ignorePath = path.join(tmpDir, '.reposageignore');
    await fs.promises.writeFile(ignorePath, '# This is a comment\n*.log\n# Another comment\nnode_modules/\n');
    const result = parseIgnoreFile(ignorePath);
    assert.equal(result.length, 2);
    assert.ok(!result.includes('# This is a comment'));
    assert.ok(!result.includes('# Another comment'));
    assert.ok(result.includes('*.log'));
    assert.ok(result.includes('node_modules/'));
  });
});

test('parseIgnoreFile strips blank lines', async () => {
  await withTempDir(async (tmpDir) => {
    const ignorePath = path.join(tmpDir, '.reposageignore');
    await fs.promises.writeFile(ignorePath, '\n\n*.js\n\n  \n\nnode_modules/\n');
    const result = parseIgnoreFile(ignorePath);
    assert.equal(result.length, 2);
    assert.ok(result.includes('*.js'));
    assert.ok(result.includes('node_modules/'));
  });
});

test('parseIgnoreFile trims whitespace from each pattern', async () => {
  await withTempDir(async (tmpDir) => {
    const ignorePath = path.join(tmpDir, '.reposageignore');
    await fs.promises.writeFile(ignorePath, '  *.js  \n  node_modules/  \n');
    const result = parseIgnoreFile(ignorePath);
    assert.equal(result[0], '*.js');
    assert.equal(result[1], 'node_modules/');
  });
});

test('parseIgnoreFile preserves non-comment non-blank patterns', async () => {
  await withTempDir(async (tmpDir) => {
    const ignorePath = path.join(tmpDir, '.reposageignore');
    const content = '*.js\n*.log\nnode_modules/\n.git/\n**/*.pyc';
    await fs.promises.writeFile(ignorePath, content);
    const result = parseIgnoreFile(ignorePath);
    assert.equal(result.length, 5);
    assert.ok(result.includes('*.js'));
    assert.ok(result.includes('*.log'));
    assert.ok(result.includes('node_modules/'));
    assert.ok(result.includes('.git/'));
    assert.ok(result.includes('**/*.pyc'));
  });
});

test('shouldIgnore returns false when no .reposageignore file exists in repoRoot', async () => {
  await withTempDir(async (tmpDir) => {
    const result = shouldIgnore('src/app.js', tmpDir);
    assert.equal(result, false);
  });
});

test('shouldIgnore returns true for exact filename match', async () => {
  await withTempDir(async (tmpDir) => {
    const ignorePath = path.join(tmpDir, '.reposageignore');
    await fs.promises.writeFile(ignorePath, '*.js\n');
    const result = shouldIgnore('src/app.js', tmpDir);
    assert.equal(result, true);
  });
});

test('shouldIgnore returns true for ** double-star glob', async () => {
  await withTempDir(async (tmpDir) => {
    const ignorePath = path.join(tmpDir, '.reposageignore');
    await fs.promises.writeFile(ignorePath, '**/*.pyc\n');
    const result = shouldIgnore('src/cache/file.pyc', tmpDir);
    assert.equal(result, true);
  });
});

test('shouldIgnore returns true for trailing slash directory pattern', async () => {
  await withTempDir(async (tmpDir) => {
    const ignorePath = path.join(tmpDir, '.reposageignore');
    await fs.promises.writeFile(ignorePath, 'node_modules/\n');
    const result = shouldIgnore('node_modules/package/index.js', tmpDir);
    assert.equal(result, true);
  });
});

test('shouldIgnore matches basename against pattern', async () => {
  await withTempDir(async (tmpDir) => {
    const ignorePath = path.join(tmpDir, '.reposageignore');
    await fs.promises.writeFile(ignorePath, 'node_modules\n');
    // shouldIgnore also matches basename against pattern (not just full path)
    const result = shouldIgnore('node_modules', tmpDir);
    assert.equal(result, true);
  });
});

test('shouldIgnore returns false for non-matching paths', async () => {
  await withTempDir(async (tmpDir) => {
    const ignorePath = path.join(tmpDir, '.reposageignore');
    await fs.promises.writeFile(ignorePath, '*.py\n');
    const result = shouldIgnore('src/app.js', tmpDir);
    assert.equal(result, false);
  });
});

test('shouldIgnore handles paths with backslashes by normalizing to forward slashes', async () => {
  await withTempDir(async (tmpDir) => {
    const ignorePath = path.join(tmpDir, '.reposageignore');
    await fs.promises.writeFile(ignorePath, '*.js\n');
    // path with backslashes
    const result = shouldIgnore('src\\app.js', tmpDir);
    // Should normalize and match
    assert.equal(result, true);
  });
});

test('shouldIgnore handles empty patterns array (no .reposageignore content)', async () => {
  await withTempDir(async (tmpDir) => {
    const ignorePath = path.join(tmpDir, '.reposageignore');
    await fs.promises.writeFile(ignorePath, '# only comments\n# another comment\n');
    const result = shouldIgnore('src/app.js', tmpDir);
    assert.equal(result, false);
  });
});

test('shouldIgnore matches pattern with asterisk wildcard', async () => {
  await withTempDir(async (tmpDir) => {
    const ignorePath = path.join(tmpDir, '.reposageignore');
    await fs.promises.writeFile(ignorePath, '*.test.js\n');
    const result = shouldIgnore('helpers.test.js', tmpDir);
    assert.equal(result, true);
  });
});

test('shouldIgnore does not match when path does not match pattern', async () => {
  await withTempDir(async (tmpDir) => {
    const ignorePath = path.join(tmpDir, '.reposageignore');
    await fs.promises.writeFile(ignorePath, '*.test.js\n');
    const result = shouldIgnore('helpers.js', tmpDir);
    assert.equal(result, false);
  });
});

test('shouldIgnore throws TypeError when filePath is null', async () => {
  await withTempDir(async (tmpDir) => {
    const ignorePath = path.join(tmpDir, '.reposageignore');
    await fs.promises.writeFile(ignorePath, '*.js\n');
    try {
      shouldIgnore(null, tmpDir);
      assert.fail('Expected TypeError to be thrown');
    } catch (e) {
      assert.ok(e instanceof TypeError, 'Should throw TypeError');
      assert.ok(e.message.includes('replace'), 'Error relates to string operation');
    }
  });
});

test('shouldIgnore returns false for empty filePath input', async () => {
  await withTempDir(async (tmpDir) => {
    const ignorePath = path.join(tmpDir, '.reposageignore');
    await fs.promises.writeFile(ignorePath, '*.js\n');
    const result = shouldIgnore('', tmpDir);
    assert.equal(result, false);
  });
});

test('shouldIgnore directory segment matching with trailing slash', async () => {
  await withTempDir(async (tmpDir) => {
    const ignorePath = path.join(tmpDir, '.reposageignore');
    await fs.promises.writeFile(ignorePath, 'build/\n');
    const result = shouldIgnore('build/output.js', tmpDir);
    assert.equal(result, true);
  });
});

test('shouldIgnore directory pattern matches any file in that directory', async () => {
  await withTempDir(async (tmpDir) => {
    const ignorePath = path.join(tmpDir, '.reposageignore');
    await fs.promises.writeFile(ignorePath, 'temp/\n');
    const result = shouldIgnore('temp/repo/file.txt', tmpDir);
    assert.equal(result, true);
  });
});
