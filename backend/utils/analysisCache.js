import crypto from 'crypto';

/**
 * In-memory cache for code analysis results with TTL support.
 * Stores analysis responses keyed by a hash of the request parameters
 * (repoUrl, files hash, model, language, etc.) to avoid redundant LLM calls
 * for identical or very similar analyses.
 *
 * TODO: For distributed deployments, migrate to Redis-backed cache.
 */

class AsyncLock {
  constructor() {
    this._promise = null;
    this._resolve = null;
  }
  async acquire(fn) {
    while (this._promise) {
      await this._promise;
    }
    this._promise = new Promise(resolve => { this._resolve = resolve; });
    try {
      return await fn();
    } finally {
      const resolve = this._resolve;
      this._promise = null;
      this._resolve = null;
      if (resolve) resolve();
    }
  }
}

class AnalysisCache {
  constructor(ttlMs = 3600000) {
    this.ttlMs = ttlMs;
    this.maxEntries = 1000;
    this.cache = new Map();
    this.pending = new Map();
    this._locks = new Map();
    this._repoUrlIndex = new Map();
    this.stats = { hits: 0, misses: 0, dedupSaves: 0 };
    this._startSweeper();
  }

  /**
   * Generate a deterministic cache key from analysis parameters.
   * Includes repoUrl, file hashes, model, language, and other params.
   */
  generateKey(repoUrl, files, params = {}) {
    const {
      model = 'llama-3.3-70b-versatile',
      language = 'English',
      company = 'General',
      systemPrompt = '',
      temperature = 0.7,
      maxTokens = 2048,
      batchSize = 5,
    } = params;

    // Create a hash of the files to ensure changes are detected
    const filesHash = crypto
      .createHash('sha256')
      .update(
        files
          .map(f => `${f.name}:${crypto.createHash('sha256').update(f.content).digest('hex')}`)
          .join('|')
      )
      .digest('hex')
      .slice(0, 12);

    const keyData = `${repoUrl}|${filesHash}|${model}|${language}|${company}|${systemPrompt}|${temperature}|${maxTokens}|${batchSize}`;
    return crypto.createHash('sha256').update(keyData).digest('hex');
  }

  /**
   * Retrieve a cached analysis result if it exists and hasn't expired.
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    const now = Date.now();
    if (now > entry.expiresAt) {
      // Entry has expired, remove it
      this.cache.delete(key);
      this.stats.misses++;
      console.log(`⏰ Analysis cache expired for key ${key.slice(0, 8)}...`);
      return null;
    }

    // Cache hit — extend TTL (sliding window) so active entries don't expire mid-session
    entry.expiresAt = now + this.ttlMs;
    this.stats.hits++;
    console.log(`✅ Analysis cache hit for key ${key.slice(0, 8)}... (${this.cache.size} entries, ${this.stats.hits} hits, ${this.stats.misses} misses)`);
    return entry.result;
  }

  /**
   * Store an analysis result in the cache with expiration time.
   */
  set(key, result, repoUrl) {
    if (this.cache.has(key)) {
      const entry = this.cache.get(key);
      this.cache.delete(key);
      if (entry.repoUrl && this._repoUrlIndex.has(entry.repoUrl)) {
        this._repoUrlIndex.get(entry.repoUrl).delete(key);
      }
    } else if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        const entry = this.cache.get(oldestKey);
        this.cache.delete(oldestKey);
        if (entry && entry.repoUrl && this._repoUrlIndex.has(entry.repoUrl)) {
          this._repoUrlIndex.get(entry.repoUrl).delete(oldestKey);
        }
        this.stats.evictions++;
      }
    }
    const expiresAt = Date.now() + this.ttlMs;
    const normalizedRepoUrl = repoUrl ? repoUrl.replace(/\/+$/, '').toLowerCase() : undefined;
    this.cache.set(key, { result, expiresAt, repoUrl: normalizedRepoUrl });
    if (normalizedRepoUrl) {
      if (!this._repoUrlIndex.has(normalizedRepoUrl)) {
        this._repoUrlIndex.set(normalizedRepoUrl, new Set());
      }
      this._repoUrlIndex.get(normalizedRepoUrl).add(key);
    }
    console.log(`💾 Cached analysis result for key ${key.slice(0, 8)}... (${this.cache.size}/${this.maxEntries} entries, ${this.stats.evictions} evictions)`);
  }

  /**
   * Retrieve a cached analysis result or fetch it safely if missing/concurrent.
   * Uses per-key locks to prevent duplicate fetches (thundering herd mitigation).
   */
  async getOrSet(key, fetcher, repoUrl) {
    const cached = this.get(key);
    if (cached) return cached;

    let lock = this._locks.get(key);
    if (!lock) {
      lock = new AsyncLock();
      this._locks.set(key, lock);
    }

    return lock.acquire(async () => {
      const recheck = this.get(key);
      if (recheck) {
        this.stats.dedupSaves++;
        return recheck;
      }

      const pending = this.pending.get(key);
      if (pending) {
        this.stats.dedupSaves++;
        return pending;
      }

      const promise = fetcher().then(result => {
        this.set(key, result, repoUrl);
        this.pending.delete(key);
        return result;
      }).catch(err => {
        this.pending.delete(key);
        throw err;
      });

      this.pending.set(key, promise);
      return promise;
    });
  }

  /**
   * Clear all entries from the cache.
   */
  clear() {
    this._stopSweeper();
    const size = this.cache.size;
    this.cache.clear();
    this._repoUrlIndex.clear();
    console.log(`🗑️  Cleared analysis cache (${size} entries removed)`);
  }

  /**
   * Get cache statistics for monitoring and debugging.
   */
  _startSweeper(intervalMs = 60000) {
    if (this._sweeper) return;
    this._sweeper = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache) {
        if (now > entry.expiresAt) {
          this.cache.delete(key);
          if (entry.repoUrl && this._repoUrlIndex.has(entry.repoUrl)) {
            this._repoUrlIndex.get(entry.repoUrl).delete(key);
          }
        }
      }
    }, intervalMs);
    if (this._sweeper.unref) this._sweeper.unref();
  }

  _stopSweeper() {
    if (this._sweeper) {
      clearInterval(this._sweeper);
      this._sweeper = null;
    }
  }

  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? ((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100).toFixed(1)
      : 'N/A';

    return {
      size: this.cache.size,
      maxEntries: this.maxEntries,
      hits: this.stats.hits,
      misses: this.stats.misses,
      evictions: this.stats.evictions,
      hitRate: `${hitRate}%`,
      ttlMinutes: this.ttlMs / 1000 / 60,
    };
  }

  /**
   * Manually expire an entry (useful for testing or cache invalidation).
   */
  invalidate(key) {
    if (this.cache.has(key)) {
      const entry = this.cache.get(key);
      this.cache.delete(key);
      if (entry.repoUrl && this._repoUrlIndex.has(entry.repoUrl)) {
        this._repoUrlIndex.get(entry.repoUrl).delete(key);
      }
      console.log(`❌ Invalidated cache entry for key ${key.slice(0, 8)}...`);
      return true;
    }
    return false;
  }

  /**
   * Invalidate all cache entries by repo URL.
   * Iterates the cache and removes entries whose key matches the given repo URL.
   */
  invalidateByRepoUrl(repoUrl) {
    const normalized = repoUrl.replace(/\/+$/, '').toLowerCase();
    const keys = this._repoUrlIndex.get(normalized);
    if (!keys || keys.size === 0) {
      return 0;
    }
    let removed = 0;
      for (const key of keys) {
        if (this.cache.delete(key)) {
        removed++;
      }
    }
    this._repoUrlIndex.delete(normalized);
    if (removed > 0) {
      this.stats.evictions += removed;
      console.log(`🗑️  Invalidated ${removed} cache entries for repo ${repoUrl}`);
    }
    return removed;
  }

  /**
   * Set custom TTL (in milliseconds).
   */
  setTtl(ttlMs) {
    this.ttlMs = ttlMs;
  }

  setMaxEntries(max) {
    this.maxEntries = max;
    while (this.cache.size > this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        const entry = this.cache.get(oldestKey);
        this.cache.delete(oldestKey);
        if (entry && entry.repoUrl && this._repoUrlIndex.has(entry.repoUrl)) {
          this._repoUrlIndex.get(entry.repoUrl).delete(oldestKey);
        }
        this.stats.evictions++;
      }
    }
  }
}

export default AnalysisCache;
