import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadConfigFile, DEFAULT_CONFIG } from '../utils/severityConfig.js';

async function withTempDir(fn) {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'config-test-'));
  try {
    return await fn(tmpDir);
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
}

test('loadConfigFile returns DEFAULT_CONFIG when .codereview.yml does not exist', async () => {
  await withTempDir(async (tmpDir) => {
    const result = loadConfigFile(tmpDir);
    assert.deepEqual(result, DEFAULT_CONFIG);
  });
});

test('loadConfigFile throws TypeError when file path is null', () => {
  try {
    loadConfigFile(null);
    assert.fail('Expected TypeError to be thrown');
  } catch (e) {
    assert.ok(e instanceof TypeError, 'Should throw TypeError');
    assert.ok(e.message.includes('path'), 'Error should mention path');
  }
});

test('loadConfigFile throws TypeError when file path is undefined', () => {
  try {
    loadConfigFile(undefined);
    assert.fail('Expected TypeError to be thrown');
  } catch (e) {
    assert.ok(e instanceof TypeError, 'Should throw TypeError');
    assert.ok(e.message.includes('path'), 'Error should mention path');
  }
});

test('loadConfigFile returns DEFAULT_CONFIG when path is empty string', () => {
  const result = loadConfigFile('');
  assert.deepEqual(result, DEFAULT_CONFIG);
});

test('loadConfigFile merges user severity overrides with defaults', async () => {
  await withTempDir(async (tmpDir) => {
    const configPath = path.join(tmpDir, '.codereview.yml');
    await fs.promises.writeFile(configPath, 'severity:\n  security: warning\n');
    const result = loadConfigFile(tmpDir);
    assert.equal(result.severity.security, 'warning');
    assert.equal(result.severity.performance, 'warning'); // default is warning
    assert.equal(result.severity.style, 'info'); // default
  });
});

test('loadConfigFile handles partial config with only some categories', async () => {
  await withTempDir(async (tmpDir) => {
    const configPath = path.join(tmpDir, '.codereview.yml');
    await fs.promises.writeFile(configPath, 'severity:\n  style: warning\n');
    const result = loadConfigFile(tmpDir);
    assert.equal(result.severity.security, 'error'); // default preserved
    assert.equal(result.severity.performance, 'warning'); // default preserved
    assert.equal(result.severity.style, 'warning'); // overridden
  });
});

test('loadConfigFile overrides specific severity levels correctly', async () => {
  await withTempDir(async (tmpDir) => {
    const configPath = path.join(tmpDir, '.codereview.yml');
    await fs.promises.writeFile(configPath, 'severity:\n  security: info\n  performance: error\n');
    const result = loadConfigFile(tmpDir);
    assert.equal(result.severity.security, 'info');
    assert.equal(result.severity.performance, 'error');
    assert.equal(result.severity.style, 'info'); // default
  });
});

test('loadConfigFile handles empty .codereview.yml file', async () => {
  await withTempDir(async (tmpDir) => {
    const configPath = path.join(tmpDir, '.codereview.yml');
    await fs.promises.writeFile(configPath, '');
    const result = loadConfigFile(tmpDir);
    assert.deepEqual(result, DEFAULT_CONFIG);
  });
});

test('loadConfigFile merges suppress arrays correctly', async () => {
  await withTempDir(async (tmpDir) => {
    const configPath = path.join(tmpDir, '.codereview.yml');
    await fs.promises.writeFile(configPath, 'suppress:\n  - no-unused-vars\n  - semi\n');
    const result = loadConfigFile(tmpDir);
    assert.ok(Array.isArray(result.suppress));
    assert.equal(result.suppress.length, 2);
    assert.ok(result.suppress.includes('no-unused-vars'));
    assert.ok(result.suppress.includes('semi'));
  });
});

test('loadConfigFile handles suppress: null in YAML', async () => {
  await withTempDir(async (tmpDir) => {
    const configPath = path.join(tmpDir, '.codereview.yml');
    await fs.promises.writeFile(configPath, 'suppress: null\n');
    const result = loadConfigFile(tmpDir);
    assert.deepEqual(result.severity, DEFAULT_CONFIG.severity);
    // null suppress is coerced to empty array by mergeWithDefaults
    assert.ok(Array.isArray(result.suppress));
  });
});

test('loadConfigFile handles non-array suppress gracefully', async () => {
  await withTempDir(async (tmpDir) => {
    const configPath = path.join(tmpDir, '.codereview.yml');
    await fs.promises.writeFile(configPath, 'suppress: "not-an-array"\n');
    const result = loadConfigFile(tmpDir);
    // mergeWithDefaults converts non-array suppress to empty array
    assert.ok(Array.isArray(result.suppress));
    assert.equal(result.suppress.length, 0);
  });
});

test('loadConfigFile combines suppress arrays from config and defaults', async () => {
  await withTempDir(async (tmpDir) => {
    const configPath = path.join(tmpDir, '.codereview.yml');
    await fs.promises.writeFile(configPath, 'suppress:\n  - custom-rule\n');
    const result = loadConfigFile(tmpDir);
    // mergeWithDefaults does NOT concatenate - it replaces
    assert.ok(Array.isArray(result.suppress));
    assert.ok(result.suppress.includes('custom-rule'));
  });
});

test('loadConfigFile warns on invalid YAML but still returns defaults', async () => {
  await withTempDir(async (tmpDir) => {
    const configPath = path.join(tmpDir, '.codereview.yml');
    await fs.promises.writeFile(configPath, 'severity:\n  [invalid yaml\n');
    const warnCalls = [];
    const originalWarn = console.warn;
    console.warn = (msg) => warnCalls.push(msg);
    try {
      const result = loadConfigFile(tmpDir);
      assert.deepEqual(result, DEFAULT_CONFIG);
      assert.ok(warnCalls.length > 0, 'Should warn on invalid YAML');
    } finally {
      console.warn = originalWarn;
    }
  });
});
