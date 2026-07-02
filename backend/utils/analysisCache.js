import crypto from 'crypto';

/**
 * In-memory cache for code analysis results with TTL support.
 * Stores analysis responses keyed by a hash of the request parameters
 * (repoUrl, files hash, model, language, etc.) to avoid redundant LLM calls
 * for identical or very similar analyses.
 *
 * TODO: For distributed deployments, migrate to Redis-backed cache.
 */

class AnalysisCache {
  constructor(ttlMs = 3600000) {
    this.ttlMs = ttlMs;
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
      // Entry has expired, remove it
      this.cache.delete(key);
      this.stats.misses++;
      console.log(`⏰ Analysis cache expired for key ${key.slice(0, 8)}...`);
      return null;
    }

    // Cache hit
    this.stats.hits++;
    console.log(`✅ Analysis cache hit for key ${key.slice(0, 8)}... (${this.cache.size} entries, ${this.stats.hits} hits, ${this.stats.misses} misses)`);
    return entry.result;
  }

  /**
   * Store an analysis result in the cache with expiration time.
   */
  set(key, result, repoUrl) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
        this.stats.evictions++;
      }
    }
    const expiresAt = Date.now() + this.ttlMs;
    const normalizedRepoUrl = repoUrl ? repoUrl.replace(/\/+$/, '').toLowerCase() : undefined;
    this.cache.set(key, { result, expiresAt, repoUrl: normalizedRepoUrl });
    console.log(`💾 Cached analysis result for key ${key.slice(0, 8)}... (${this.cache.size}/${this.maxEntries} entries, ${this.stats.evictions} evictions)`);
  }

  /**
   * Retrieve a cached analysis result or fetch it safely if missing/concurrent.
   */
  async getOrSet(key, fetcher, repoUrl) {
    const cached = this.get(key);
    if (cached) return cached;
    
    const existing = this.pending.get(key);
    if (existing) return existing;
    
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
      this.cache.delete(key);
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
    let removed = 0;
    for (const [key, entry] of this.cache) {
      if (entry.repoUrl && entry.repoUrl === normalized) {
        this.cache.delete(key);
        removed++;
      }
    }
    if (removed > 0) {
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
        this.cache.delete(oldestKey);
        this.stats.evictions++;
      }
    }
  }
}

export default AnalysisCache;
