import crypto from 'crypto';

/**
 * In-memory cache for code analysis results with TTL support.
 * Stores analysis responses keyed by a hash of the request parameters
 * (repoUrl, files hash, model, language, etc.) to avoid redundant LLM calls
 * for identical or very similar analyses.
 *
 * Supports quality-aware caching: mock/fallback results get a shorter TTL
 * so they are promptly replaced when the AI engine recovers.
 *
 * TODO: For distributed deployments, migrate to Redis-backed cache.
 */

class AnalysisCache {
  constructor(ttlMs = 3600000, mockTtlMs = 120000) {
    this.ttlMs = ttlMs;
    this.mockTtlMs = mockTtlMs;
    this.maxEntries = 1000;
    this.cache = new Map();
    this.pending = new Map();
    this.stats = { hits: 0, misses: 0, evictions: 0 };
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
      this.cache.delete(key);
      this.stats.misses++;
      console.log(`⏰ Analysis cache expired for key ${key.slice(0, 8)}...`);
      return null;
    }

    this.stats.hits++;
    const qualityLabel = entry.isMock ? '⚠️ MOCK' : '✅';
    console.log(`${qualityLabel} Analysis cache hit for key ${key.slice(0, 8)}... (${this.cache.size} entries, ${this.stats.hits} hits, ${this.stats.misses} misses)`);
    return entry.result;
  }

  /**
   * Store an analysis result in the cache with expiration time.
   * Options can include { isMock: true } for fallback results.
   */
  set(key, result, options = {}) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
        this.stats.evictions++;
      }
    }
    const ttl = options.isMock ? this.mockTtlMs : this.ttlMs;
    const expiresAt = Date.now() + ttl;
    this.cache.set(key, { result, expiresAt, isMock: !!options.isMock });
    const qualityLabel = options.isMock ? '⚠️ MOCK' : '💾';
    console.log(`${qualityLabel} Cached analysis result for key ${key.slice(0, 8)}... (${this.cache.size}/${this.maxEntries} entries, ${this.stats.evictions} evictions, ttl=${ttl}ms)`);
  }

  /**
   * Retrieve a cached analysis result or fetch it safely if missing/concurrent.
   */
  async getOrSet(key, fetcher) {
    const cached = this.get(key);
    if (cached) return cached;
    
    const existing = this.pending.get(key);
    if (existing) return existing;
    
    const promise = fetcher().then(result => {
        const cacheHint = (result && result._cacheHint) || {};
        const resultData = (result && result._data !== undefined) ? result._data : result;
        const isMock = cacheHint.isMock === true || result._mock === true;
        this.set(key, resultData, { isMock });
        this.pending.delete(key);
        return resultData;
    }).catch(err => {
        this.pending.delete(key);
        throw err;
    });
    
    this.pending.set(key, promise);
    return promise;
  }

  /**
   * Clear all mock entries from the cache (used when AI engine recovers).
   */
  clearMockEntries() {
    let cleared = 0;
    for (const [key, entry] of this.cache) {
      if (entry.isMock) {
        this.cache.delete(key);
        cleared++;
      }
    }
    if (cleared > 0) {
      console.log(`🧹 Cleared ${cleared} mock cache entries after AI Engine recovery`);
    }
    return cleared;
  }

  /**
   * Clear all entries from the cache.
   */
  clear() {
    this._stopSweeper();
    const size = this.cache.size;
    this.cache.clear();
    console.log(`🗑️  Cleared analysis cache (${size} entries removed)`);
  }

  /**
   * Invalidate all cache entries whose key contains the given repo URL.
   * Used by push-event webhook handling to evict stale analysis data.
   */
  invalidateByRepoUrl(repoUrl) {
    const normalized = repoUrl.replace(/\/+$/, '').toLowerCase();
    let removed = 0;
    for (const [key] of this.cache) {
      const keyStr = key;
      if (keyStr.includes(normalized)) {
        this.cache.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
      console.log(`🗑️  Invalidated ${removed} cache entries for ${repoUrl}`);
    }
    return removed;
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

    let totalAge = 0;
    let mockCount = 0;
    for (const entry of this.cache.values()) {
      totalAge += Date.now() - (entry.expiresAt - this.ttlMs);
      if (entry.isMock) mockCount++;
    }

    return {
      size: this.cache.size,
      maxEntries: this.maxEntries,
      hits: this.stats.hits,
      misses: this.stats.misses,
      mockCount,
      avgAgeMs: this.cache.size > 0 ? Math.round(totalAge / this.cache.size) : 0,
      evictions: this.stats.evictions,
      hitRate: `${hitRate}%`,
      ttlMinutes: this.ttlMs / 1000 / 60,
      mockTtlSeconds: this.mockTtlMs / 1000,
    };
  }

  /**
   * Manually expire an entry (useful for testing or cache invalidation).
   */
  invalidate(key) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
      console.log(`❌ Invalidated cache entry for key ${key.slice(0, 8)}...`);
      return true;
    }
    return false;
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
        this.cache.delete(oldestKey);
        this.stats.evictions++;
      }
    }
  }
}

export default AnalysisCache;
