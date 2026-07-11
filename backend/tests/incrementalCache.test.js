import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'crypto';

import {
  loadCacheFile,
  saveCacheFile,
  CACHE_FILENAME,
} from '../utils/incrementalReviewer.js';

async function withTempDir(fn) {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cache-test-'));
  try {
    return await fn(tmpDir);
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
}

test('saveCacheFile creates a cache file without throwing', async () => {
  await withTempDir(async (tmpDir) => {
    const cachePath = path.join(tmpDir, 'my-repo');
    // Should not throw
    saveCacheFile(cachePath, { 'file1.js': 'hash1' });
    // Verify file was created
    const cacheDir = path.join(os.tmpdir(), 'reposage-review-cache');
    const files = await fs.promises.readdir(cacheDir);
    assert.ok(files.length >= 1, 'cache directory should contain at least one entry');
  });
});

test('saveCacheFile and loadCacheFile round-trip a populated cache', async () => {
  await withTempDir(async (tmpDir) => {
    const cachePath = path.join(tmpDir, 'my-repo');
    const cacheData = {
      'src/index.js': 'abc123',
      'src/utils.js': 'def456',
      'tests/main.js': 'ghi789',
    };

    saveCacheFile(cachePath, cacheData);

    const loaded = loadCacheFile(cachePath);
    assert.deepEqual(loaded, cacheData, 'loaded cache should match saved cache');
  });
});

test('saveCacheFile and loadCacheFile round-trip an empty cache', async () => {
  await withTempDir(async (tmpDir) => {
    const cachePath = path.join(tmpDir, 'empty-repo');
    saveCacheFile(cachePath, {});
    const loaded = loadCacheFile(cachePath);
    assert.deepEqual(loaded, {}, 'empty cache should round-trip correctly');
  });
});

test('loadCacheFile returns empty object when cache file does not exist', async () => {
  await withTempDir(async (tmpDir) => {
    const cachePath = path.join(tmpDir, 'nonexistent-repo');
    const result = loadCacheFile(cachePath);
    assert.deepEqual(result, {}, 'should return {} when no cache file exists');
  });
});

test('loadCacheFile returns empty object when file content is invalid JSON', async () => {
  await withTempDir(async (tmpDir) => {
    const cachePath = path.join(tmpDir, 'corrupt-repo');
    // Pre-create the cache directory and file with invalid JSON
    const hash = crypto
      .createHash('sha256')
      .update(cachePath)
      .digest('hex')
      .substring(0, 16);
    const cacheDir = path.join(os.tmpdir(), 'reposage-review-cache', hash);
    await fs.promises.mkdir(cacheDir, { recursive: true });
    await fs.promises.writeFile(
      path.join(cacheDir, CACHE_FILENAME),
      'not valid json {',
      'utf-8'
    );

    const result = loadCacheFile(cachePath);
    assert.deepEqual(result, {}, 'should return {} for invalid JSON');
  });
});

test('loadCacheFile returns empty object when fs.readFileSync throws', async () => {
  // When fs.readFileSync throws (e.g., disk error), function should return {}
  // We simulate this by patching readFileSync temporarily
  const originalReadFileSync = fs.readFileSync;
  fs.readFileSync = () => {
    throw new Error('Simulated disk read error');
  };
  try {
    const result = loadCacheFile('/some/fake/path');
    assert.deepEqual(result, {}, 'should return {} when readFileSync throws');
  } finally {
    fs.readFileSync = originalReadFileSync;
  }
});

test('saveCacheFile silently handles write errors without throwing', async () => {
  // Write to an invalid path should not throw
  const result = saveCacheFile('/nonexistent/readonly/path/repo', { key: 'value' });
  // Function returns void (undefined), no exception should be thrown
  assert.equal(result, undefined);
});

test('loadCacheFile returns empty object for deeply nested cache path', async () => {
  await withTempDir(async (tmpDir) => {
    const cachePath = path.join(tmpDir, 'a', 'b', 'c', 'deep-repo');
    const result = loadCacheFile(cachePath);
    assert.deepEqual(result, {}, 'should return {} when no cache exists for deep path');
  });
});

test('loadCacheFile returns correct data after multiple saveCacheFile calls', async () => {
  await withTempDir(async (tmpDir) => {
    const cachePath = path.join(tmpDir, 'multi-save-repo');

    saveCacheFile(cachePath, { 'file1.js': 'hash1' });
    const first = loadCacheFile(cachePath);
    assert.equal(first['file1.js'], 'hash1');

    saveCacheFile(cachePath, { 'file1.js': 'hash2', 'file2.js': 'hash3' });
    const second = loadCacheFile(cachePath);
    assert.equal(second['file1.js'], 'hash2');
    assert.equal(second['file2.js'], 'hash3');
  });
});

test('saveCacheFile produces valid JSON in the cache file', async () => {
  await withTempDir(async (tmpDir) => {
    const cachePath = path.join(tmpDir, 'json-verify-repo');
    const cacheData = { a: 1, b: 'string', c: true, d: null, e: [1, 2, 3] };
    saveCacheFile(cachePath, cacheData);

    const loaded = loadCacheFile(cachePath);
    assert.deepEqual(loaded, cacheData);
  });
});
