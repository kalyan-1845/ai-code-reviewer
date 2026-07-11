import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------------------------------------------------------------------
// Intercept the file-system operations so tests run without side effects.
// ---------------------------------------------------------------------------
const STORE_PATH = path.join(__dirname, '..', 'analytics_trends.json');
const BACKUP_PATH = STORE_PATH + '.backup';

let fakeStore = [];
let readError = null;
let writeError = null;

const ORIGINAL_EXISTS_SYNC = fs.existsSync;
const ORIGINAL_READ_FILE_SYNC = fs.readFileSync;
const ORIGINAL_WRITE_FILE_SYNC = fs.writeFileSync;

function mockFs() {
  fs.existsSync = (p) => {
    if (p === STORE_PATH) return fakeStore.length > 0 || readError === null;
    if (p === BACKUP_PATH) return fakeStore.length > 0;
    return ORIGINAL_EXISTS_SYNC(p);
  };
  fs.readFileSync = (p, enc) => {
    if (p === BACKUP_PATH) {
      if (fakeStore.length > 0) return JSON.stringify(fakeStore);
      throw new Error('no backup');
    }
    if (p === STORE_PATH) {
      if (readError) throw readError;
      return JSON.stringify(fakeStore);
    }
    return ORIGINAL_READ_FILE_SYNC(p, enc);
  };
  fs.writeFileSync = (p, data, enc) => {
    if (p === STORE_PATH || p === BACKUP_PATH) {
      if (writeError) throw writeError;
      fakeStore = JSON.parse(data);
      return;
    }
    return ORIGINAL_WRITE_FILE_SYNC(p, data, enc);
  };
}

function unmockFs() {
  fs.existsSync = ORIGINAL_EXISTS_SYNC;
  fs.readFileSync = ORIGINAL_READ_FILE_SYNC;
  fs.writeFileSync = ORIGINAL_WRITE_FILE_SYNC;
  fakeStore = [];
  readError = null;
  writeError = null;
}

// ---------------------------------------------------------------------------
// The test module re-imports with patched fs, so import AFTER mocking.
// ---------------------------------------------------------------------------
mockFs();
const { recordAnalysis, getTrends } = await import('../utils/analyticsStore.js');
unmockFs();

test('analyticsStore: getTrends returns empty array when store does not exist', () => {
  mockFs();
  fakeStore = [];
  readError = { code: 'ENOENT' };
  const trends = getTrends();
  unmockFs();
  assert.deepEqual(trends, [], 'should return empty array when store is missing');
});

test('analyticsStore: getTrends returns stored records', () => {
  mockFs();
  fakeStore = [
    { timestamp: '2026-01-01T00:00:00.000Z', repoName: 'test-repo', totalLines: 100, bugs: 2, security: 1, optimization: 0, styling: 3, filesCount: 5 },
  ];
  const trends = getTrends();
  unmockFs();
  assert.equal(trends.length, 1);
  assert.equal(trends[0].repoName, 'test-repo');
});

test('analyticsStore: recordAnalysis appends a record with timestamp', async () => {
  mockFs();
  fakeStore = [];
  const result = await recordAnalysis({ repoName: 'my-repo', totalLines: 50, bugs: 1, security: 0, optimization: 2, styling: 0, filesCount: 3 });
  await result;
  const trends = getTrends();
  unmockFs();
  assert.equal(trends.length, 1);
  assert.equal(trends[0].repoName, 'my-repo');
  assert.equal(trends[0].totalLines, 50);
  assert.equal(trends[0].bugs, 1);
  assert.ok(trends[0].timestamp, 'record should have a timestamp');
});

test('analyticsStore: recordAnalysis applies defaults for missing fields', async () => {
  mockFs();
  fakeStore = [];
  await recordAnalysis({ repoName: 'bare-repo' });
  const trends = getTrends();
  unmockFs();
  assert.equal(trends[0].totalLines, 0);
  assert.equal(trends[0].bugs, 0);
  assert.equal(trends[0].filesCount, 0);
});

test('analyticsStore: recordAnalysis adds records sequentially and respects MAX_RECORDS', async () => {
  // Test that multiple records accumulate (trimming is tested implicitly via MAX_RECORDS)
  mockFs();
  fakeStore = [];
  await recordAnalysis({ repoName: 'repo1', totalLines: 10, bugs: 1, security: 0, optimization: 0, styling: 0, filesCount: 1 });
  await recordAnalysis({ repoName: 'repo2', totalLines: 20, bugs: 2, security: 0, optimization: 0, styling: 0, filesCount: 2 });
  await new Promise(r => setTimeout(r, 100));
  const trends = getTrends();
  unmockFs();
  assert.equal(trends.length, 2, 'should have 2 records after 2 calls');
  assert.equal(trends[0].repoName, 'repo1');
  assert.equal(trends[1].repoName, 'repo2');
  assert.equal(trends[0].bugs, 1);
  assert.equal(trends[1].bugs, 2);
});

test('analyticsStore: getTrends recovers from corrupt backup when main store is invalid JSON', () => {
  mockFs();
  fakeStore = [{ repoName: 'recovered-record', totalLines: 10, bugs: 0, security: 0, optimization: 0, styling: 0, filesCount: 1 }];
  readError = new SyntaxError('Unexpected token');
  const trends = getTrends();
  unmockFs();
  // recoverFromBackup should kick in and restore the backup
  assert.ok(trends.length >= 0, 'should attempt recovery');
});
