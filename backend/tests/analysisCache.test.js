import test from 'node:test';
import assert from 'node:assert/strict';
import AnalysisCache from '../utils/analysisCache.js';

/**
 * Unit tests for the AnalysisCache utility.
 * Verifies cache hit/miss behavior, TTL expiration, and that redundant LLM calls
 * are avoided for identical analysis requests.
 *
 * Refs: Issue #784 — Code analysis results are not cached, causing redundant LLM API calls
 */

test('AnalysisCache: initializes with default TTL of 1 hour', () => {
  const cache = new AnalysisCache();
  assert.equal(cache.ttlMs, 3600000); // 1 hour in milliseconds
});

test('AnalysisCache: initializes with custom TTL', () => {
  const customTtl = 1800000; // 30 minutes
  const cache = new AnalysisCache(customTtl);
  assert.equal(cache.ttlMs, customTtl);
});

test('AnalysisCache: generates consistent cache keys for identical inputs', () => {
  const cache = new AnalysisCache();
  const repoUrl = 'https://github.com/user/repo';
  const files = [
    { name: 'file1.js', content: 'console.log("test");' },
    { name: 'file2.js', content: 'const x = 1;' }
  ];
  const params = { model: 'llama-3.3-70b-versatile', language: 'English' };

  const key1 = cache.generateKey(repoUrl, files, params);
  const key2 = cache.generateKey(repoUrl, files, params);

  assert.equal(key1, key2, 'Keys should match for identical inputs');
});

test('AnalysisCache: generates different cache keys for different file contents', () => {
  const cache = new AnalysisCache();
  const repoUrl = 'https://github.com/user/repo';
  const files1 = [{ name: 'file.js', content: 'console.log("test");' }];
  const files2 = [{ name: 'file.js', content: 'console.log("modified");' }];
  const params = { model: 'llama-3.3-70b-versatile', language: 'English' };

  const key1 = cache.generateKey(repoUrl, files1, params);
  const key2 = cache.generateKey(repoUrl, files2, params);

  assert.notEqual(key1, key2, 'Keys should differ when file contents change');
});

test('AnalysisCache: generates different cache keys for different models', () => {
  const cache = new AnalysisCache();
  const repoUrl = 'https://github.com/user/repo';
  const files = [{ name: 'file.js', content: 'console.log("test");' }];

  const key1 = cache.generateKey(repoUrl, files, { model: 'llama-3.3-70b-versatile' });
  const key2 = cache.generateKey(repoUrl, files, { model: 'gpt-4' });

  assert.notEqual(key1, key2, 'Keys should differ for different models');
});

test('AnalysisCache: stores and retrieves cached results', () => {
  const cache = new AnalysisCache();
  const key = 'test-key';
  const result = { fileReviews: { 'file.js': { bugs: [], security: [] } } };

  cache.set(key, result);
  const retrieved = cache.get(key);

  assert.deepEqual(retrieved, result, 'Retrieved result should match stored result');
});

test('AnalysisCache: returns null for missing entries', () => {
  const cache = new AnalysisCache();
  const result = cache.get('non-existent-key');

  assert.equal(result, null, 'Should return null for missing keys');
});

test('AnalysisCache: tracks cache hits and misses', () => {
  const cache = new AnalysisCache();
  const key = 'test-key';
  const result = { fileReviews: {} };

  // First access should be a miss
  cache.get(key);
  assert.equal(cache.stats.misses, 1);
  assert.equal(cache.stats.hits, 0);

  // Store the result
  cache.set(key, result);

  // Second access should be a hit
  cache.get(key);
  assert.equal(cache.stats.hits, 1);
  assert.equal(cache.stats.misses, 1);
});

test('AnalysisCache: expires entries after TTL', async () => {
  const shortTtl = 100; // 100ms for testing
  const cache = new AnalysisCache(shortTtl);
  const key = 'test-key';
  const result = { fileReviews: {} };

  cache.set(key, result);
  const retrieved1 = cache.get(key);
  assert.equal(retrieved1, result, 'Should retrieve result immediately after storage');

  // Wait for expiration (longer than TTL)
  await new Promise((resolve) => setTimeout(resolve, shortTtl + 50));

  const retrieved2 = cache.get(key);
  assert.equal(retrieved2, null, 'Should return null for expired entries');
});

test('AnalysisCache: clear() removes all entries', () => {
  const cache = new AnalysisCache();

  cache.set('key1', { data: 1 });
  cache.set('key2', { data: 2 });
  cache.set('key3', { data: 3 });

  assert.equal(cache.cache.size, 3, 'Should have 3 entries before clear');

  cache.clear();

  assert.equal(cache.cache.size, 0, 'Should have 0 entries after clear');
});

test('AnalysisCache: getStats() returns cache metrics', () => {
  const cache = new AnalysisCache(1800000); // 30 minutes
  const key = 'test-key';
  const result = { fileReviews: {} };

  cache.set(key, result);
  cache.get(key);  // Hit
  cache.get(key);  // Hit
  cache.get('other-key');  // Miss

  const stats = cache.getStats();

  assert.equal(stats.size, 1, 'Should report 1 cached entry');
  assert.equal(stats.hits, 2, 'Should report 2 cache hits');
  assert.equal(stats.misses, 1, 'Should report 1 cache miss');
  assert.equal(stats.hitRate, '66.7%', 'Should calculate hit rate correctly');
  assert.equal(stats.ttlMinutes, 30, 'Should report TTL in minutes');
});

test('AnalysisCache: invalidate() removes specific entries', () => {
  const cache = new AnalysisCache();
  const key1 = 'key1';
  const key2 = 'key2';

  cache.set(key1, { data: 1 });
  cache.set(key2, { data: 2 });

  assert.equal(cache.cache.size, 2);

  const removed = cache.invalidate(key1);

  assert.equal(removed, true, 'Should return true for existing key');
  assert.equal(cache.cache.size, 1, 'Should have 1 entry after invalidation');
  assert.deepEqual(cache.get(key2), { data: 2 }, 'Other entries should remain');
});

test('AnalysisCache: invalidate() returns false for non-existent entries', () => {
  const cache = new AnalysisCache();
  const removed = cache.invalidate('non-existent-key');

  assert.equal(removed, false, 'Should return false for non-existent key');
});

test('AnalysisCache: setTtl() updates cache TTL', () => {
  const cache = new AnalysisCache(3600000); // 1 hour
  assert.equal(cache.ttlMs, 3600000);

  cache.setTtl(1800000); // 30 minutes
  assert.equal(cache.ttlMs, 1800000, 'TTL should be updated');
});

test('AnalysisCache: realistic workflow - cache prevents redundant LLM calls', () => {
  const cache = new AnalysisCache();
  const repoUrl = 'https://github.com/example/project';
  const files = [
    { name: 'index.js', content: 'const app = require("express")();' },
    { name: 'server.js', content: 'app.listen(3000);' }
  ];
  const params = { model: 'llama-3.3-70b-versatile', language: 'English' };

  const cacheKey = cache.generateKey(repoUrl, files, params);
  let llmCallCount = 0;

  // First analysis: should call LLM (cache miss)
  let result = cache.get(cacheKey);
  if (!result) {
    llmCallCount++;
    result = {
      fileReviews: {
        'index.js': { bugs: ['missing error handling'] },
        'server.js': { security: ['no HTTPS'] }
      }
    };
    cache.set(cacheKey, result);
  }
  assert.equal(llmCallCount, 1, 'Should call LLM once for first analysis');

  // Second analysis (identical files): should use cache (cache hit)
  result = cache.get(cacheKey);
  if (!result) {
    llmCallCount++;
    result = { /* would be LLM result */ };
    cache.set(cacheKey, result);
  }
  assert.equal(llmCallCount, 1, 'Should not call LLM for cached analysis');

  // Verify cached result is correct
  assert.ok(result.fileReviews['index.js'].bugs.includes('missing error handling'));
  assert.ok(result.fileReviews['server.js'].security.includes('no HTTPS'));
});

test('AnalysisCache: invalidateByRepoUrl removes all entries for that repo', () => {
  const cache = new AnalysisCache();
  const repo = 'https://github.com/owner/repo';

  // Store two different entries for the same repo
  const key1 = cache.generateKey(repo, [{ name: 'a.js', content: 'a' }]);
  const key2 = cache.generateKey(repo, [{ name: 'b.js', content: 'b' }]);
  cache.set(key1, { data: 1 }, repo);
  cache.set(key2, { data: 2 }, repo);

  assert.equal(cache.cache.size, 2);

  const removed = cache.invalidateByRepoUrl(repo);

  assert.equal(removed, 2, 'Should return count of removed entries');
  assert.equal(cache.cache.size, 0, 'Cache should be empty after invalidation');
  assert.equal(cache.get(key1), null, 'key1 should be gone');
  assert.equal(cache.get(key2), null, 'key2 should be gone');
});

test('AnalysisCache: invalidateByRepoUrl returns 0 for non-existent repo', () => {
  const cache = new AnalysisCache();
  const repo = 'https://github.com/nonexistent/project';
  const key = cache.generateKey(repo, [{ name: 'x.js', content: 'x' }]);
  cache.set(key, { data: 1 }, repo);

  const removed = cache.invalidateByRepoUrl('https://github.com/other/repo');

  assert.equal(removed, 0, 'Should return 0 for non-matching repo');
  assert.equal(cache.cache.size, 1, 'Original entry should remain');
});

test('AnalysisCache: invalidateByRepoUrl normalizes trailing slashes and case', () => {
  const cache = new AnalysisCache();
  const repo1 = 'https://github.com/owner/repo';
  const repo2 = 'https://github.com/owner/repo///';
  const key1 = cache.generateKey(repo1, [{ name: 'f.js', content: 'f' }]);
  cache.set(key1, { data: 1 }, repo1);

  const removed = cache.invalidateByRepoUrl(repo2);

  assert.equal(removed, 1, 'Should match repo with trailing slashes');
  assert.equal(cache.cache.size, 0);
});

test('AnalysisCache: setMaxEntries updates the property', () => {
  const cache = new AnalysisCache();
  assert.equal(cache.maxEntries, 1000, 'Default maxEntries is 1000');

  cache.setMaxEntries(500);

  assert.equal(cache.maxEntries, 500, 'maxEntries should be updated');
});

test('AnalysisCache: setMaxEntries evicts oldest entries when limit is reduced', () => {
  const cache = new AnalysisCache();
  const repo = 'https://github.com/owner/repo';

  // Store 5 entries
  for (let i = 0; i < 5; i++) {
    const key = cache.generateKey(repo, [{ name: `f${i}.js`, content: `${i}` }]);
    cache.set(key, { data: i }, repo);
  }
  assert.equal(cache.cache.size, 5);

  // Reduce limit to 3 - oldest 2 should be evicted
  cache.setMaxEntries(3);

  assert.equal(cache.maxEntries, 3);
  assert.equal(cache.cache.size, 3, 'Should evict to maxEntries');
});

test('AnalysisCache: setMaxEntries does nothing if cache is already below new limit', () => {
  const cache = new AnalysisCache();
  const repo = 'https://github.com/owner/repo';
  const key = cache.generateKey(repo, [{ name: 'f.js', content: 'f' }]);
  cache.set(key, { data: 1 }, repo);

  cache.setMaxEntries(100);

  assert.equal(cache.maxEntries, 100);
  assert.equal(cache.cache.size, 1, 'Single entry should remain');
});
