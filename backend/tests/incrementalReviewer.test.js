import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  buildContentHashCache,
  getFilesToReview,
  getFileContentHash,
  CACHE_FILENAME,
} from '../utils/incrementalReviewer.js';

async function withTempDir(fn) {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'incr-test-'));
  try {
    return await fn(tmpDir);
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  }
}

test('CACHE_FILENAME is a non-empty string', () => {
  assert.ok(typeof CACHE_FILENAME === 'string');
  assert.ok(CACHE_FILENAME.length > 0);
});

test('buildContentHashCache returns a cache object keyed by file path', async () => {
  await withTempDir(async (tmpDir) => {
    const fileA = path.join(tmpDir, 'foo.js');
    const fileB = path.join(tmpDir, 'bar.js');
    await fs.promises.writeFile(fileA, 'foo-content');
    await fs.promises.writeFile(fileB, 'bar-content');

    const cache = buildContentHashCache([fileA, fileB]);

    assert.ok(cache[fileA], 'foo.js should be in cache');
    assert.ok(cache[fileB], 'bar.js should be in cache');
    assert.equal(cache[fileA].length, 64, 'SHA-256 hex is 64 chars');
    assert.equal(cache[fileB].length, 64, 'SHA-256 hex is 64 chars');

    // Same content produces same hash
    const cache2 = buildContentHashCache([fileA]);
    assert.equal(cache[fileA], cache2[fileA]);
  });
});

test('buildContentHashCache skips unreadable files silently', async () => {
  await withTempDir(async (tmpDir) => {
    const goodFile = path.join(tmpDir, 'good.js');
    const missingFile = path.join(tmpDir, 'missing.js');
    await fs.promises.writeFile(goodFile, 'exists');

    const cache = buildContentHashCache([goodFile, missingFile]);

    assert.ok(cache[goodFile], 'good.js should be in cache');
    assert.equal(
      cache[missingFile],
      undefined,
      'missing.js should not be in cache'
    );
  });
});

test('getFilesToReview identifies unchanged files (same hash)', async () => {
  await withTempDir(async (tmpDir) => {
    const file = path.join(tmpDir, 'same.js');
    await fs.promises.writeFile(file, 'stable-content');

    // Cache with the hash from the current file
    const currentHash = buildContentHashCache([file])[file];
    const previousCache = { [file]: currentHash };

    const result = getFilesToReview([file], previousCache);

    assert.equal(
      result.filesToReview.length,
      0,
      'unchanged file should not be in review list'
    );
    assert.equal(result.changedCount, 0);
  });
});

test('getFilesToReview flags changed files (different hash)', async () => {
  await withTempDir(async (tmpDir) => {
    const file = path.join(tmpDir, 'changed.js');
    await fs.promises.writeFile(file, 'new-content');

    // Previous cache has a different hash
    const previousCache = {
      [file]: '0000000000000000000000000000000000000000000000000000000000000000',
    };

    const result = getFilesToReview([file], previousCache);

    assert.ok(
      result.filesToReview.includes(file),
      'changed file should be in review list'
    );
    assert.equal(result.changedCount, 1);
  });
});

test('getFilesToReview flags new files (not in previous cache)', async () => {
  await withTempDir(async (tmpDir) => {
    const fileA = path.join(tmpDir, 'existing.js');
    const fileB = path.join(tmpDir, 'brand-new.js');
    await fs.promises.writeFile(fileA, 'existing-content');
    await fs.promises.writeFile(fileB, 'new-content');

    const prevHashA = buildContentHashCache([fileA])[fileA];
    const previousCache = { [fileA]: prevHashA };

    const result = getFilesToReview([fileA, fileB], previousCache);

    assert.ok(
      !result.filesToReview.includes(fileA),
      'existing file should not be flagged (unchanged)'
    );
    assert.ok(
      result.filesToReview.includes(fileB),
      'new file should be flagged'
    );
    assert.equal(result.changedCount, 1);
    assert.equal(result.totalCount, 2);
  });
});

test('getFileContentHash returns a SHA-256 hex string for readable files', async () => {
  await withTempDir(async (tmpDir) => {
    const testFile = path.join(tmpDir, 'test.js');
    await fs.promises.writeFile(testFile, 'hello world');

    const hash = getFileContentHash(testFile);

    assert.ok(hash, 'hash should not be null');
    assert.equal(hash.length, 64, 'SHA-256 hex is 64 chars');
  });
});

test('getFileContentHash returns null for unreadable files', async () => {
  const hash = getFileContentHash('/nonexistent/path/to/file.js');
  assert.equal(hash, null, 'unreadable file should return null');
});
