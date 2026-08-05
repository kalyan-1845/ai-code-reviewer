import crypto from 'crypto';
import { registerTimer } from './timerRegistry.js';

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

class AsyncLock {
  constructor() {
    this._queue = Promise.resolve();
    this._free = true;
  }
  async acquire(fn) {
    // Mark the lock as busy so isFree() reports false while any caller is
    // queued or running, not just the currently held operation.
    this._free = false;
    // Serialize all callers through a promise chain. Each acquire()
    // waits for the previous operation to complete before executing.
    // The previous line is captured before chaining so concurrent callers
    // each get their own slot in the chain rather than all sharing one.
    const prev = this._queue;
    let release;
    const mySlot = new Promise(resolve => { release = resolve; });
    this._queue = mySlot;
    await prev;
    try {
      return await fn();
    } finally {
      release();
      // Only mark the lock free if no caller chained after us; otherwise a
      // queued waiter is still pending and the lock must stay busy.
      if (this._queue === mySlot) {
        this._free = true;
      }
    }
  }

  isFree() {
    return this._free;
  }
}

class AnalysisCache {
  constructor(ttlMs = 3600000, absoluteMaxMultiplier = 2, mockTtlMs = 120000) {
    this.ttlMs = ttlMs;
    this.absoluteMaxMultiplier = absoluteMaxMultiplier;
    this.mockTtlMs = mockTtlMs;
    this.maxEntries = 1000;
    this.cache = new Map();
    this.pending = new Map();
    this._locks = new Map();
    this._repoUrlIndex = new Map();
    this._invalidatedKeys = new Set();
    this.stats = { hits: 0, misses: 0, dedupSaves: 0, absoluteExpiries: 0, slidingExpiries: 0, evictions: 0 };
    // The sweeper is started lazily on first set() and stops itself when the
    // cache empties, so an idle instance never keeps a live interval (and a
    // garbage-collected instance cannot leak a timer through the closure).
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
          .map(f => {
            const content = typeof f.content === 'string' ? f.content : String(f.content ?? '');
            return `${f.name}:${crypto.createHash('sha256').update(content).digest('hex')}`;
          })
          .sort((a, b) => a - b)
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
    // Check absolute maximum TTL first — entries that have lived too long
    // are expired regardless of sliding TTL activity
    if (now > entry.absoluteExpiresAt) {
      this.cache.delete(key);
      this.stats.absoluteExpiries++;
      this.stats.misses++;
      console.log(`⏰ Analysis cache entry reached absolute max lifetime for key ${key.slice(0, 8)}...`);
      return null;
    }

    if (now > entry.expiresAt) {
      // Entry has expired via sliding TTL, remove it
      this.cache.delete(key);
      this.stats.slidingExpiries++;
      this.stats.misses++;
      console.log(`⏰ Analysis cache sliding TTL expired for key ${key.slice(0, 8)}...`);
      return null;
    }

    // Cache hit — promote to MRU position and extend TTL
    this.cache.delete(key);
    entry.expiresAt = now + (entry.isMock ? this.mockTtlMs : this.ttlMs);
    this.cache.set(key, entry);
    this.stats.hits++;
    const qualityLabel = entry.isMock ? '⚠️ MOCK' : '✅';
    console.log(`${qualityLabel} Analysis cache hit for key ${key.slice(0, 8)}... (${this.cache.size} entries, ${this.stats.hits} hits, ${this.stats.misses} misses)`);
    return JSON.parse(JSON.stringify(entry.result));
  }

  /**
   * Store an analysis result in the cache with expiration time.
   * Options can include { isMock: true } for fallback results.
   */
  set(key, result, options = {}) {
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
    const now = Date.now();
    const ttl = options.isMock ? this.mockTtlMs : this.ttlMs;
    const expiresAt = now + ttl;
    const absoluteExpiresAt = now + (ttl * this.absoluteMaxMultiplier);
    const repoUrl = options.repoUrl;
    const normalizedRepoUrl = repoUrl ? repoUrl.replace(/\/+$/, '').toLowerCase() : undefined;
    this.cache.set(key, { result, expiresAt, absoluteExpiresAt, createdAt: now, repoUrl: normalizedRepoUrl, isMock: !!options.isMock });
    if (normalizedRepoUrl) {
      if (!this._repoUrlIndex.has(normalizedRepoUrl)) {
        this._repoUrlIndex.set(normalizedRepoUrl, new Set());
      }
      this._repoUrlIndex.get(normalizedRepoUrl).add(key);
    }
    this._startSweeper();
    const qualityLabel = options.isMock ? '⚠️ MOCK' : '💾';
    console.log(`${qualityLabel} Cached analysis result for key ${key.slice(0, 8)}... (${this.cache.size}/${this.maxEntries} entries, ${this.stats.evictions} evictions, ttl=${ttl}ms)`);
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

    try {
      return await lock.acquire(async () => {
        const recheck = this.get(key);
        if (recheck) {
          this.stats.dedupSaves++;
          return recheck;
        }

        const pending = this.pending.get(key);
        if (pending) {
          this.stats.dedupSaves++;
          return pending.promise;
        }

        const promise = fetcher().then(result => {
          const cacheHint = (result && result._cacheHint) || {};
          const resultData = (result && result._data !== undefined) ? result._data : result;
          const isMock = cacheHint.isMock === true || result._mock === true;
          this.pending.delete(key);
          // A repo-level invalidation may have raced with this in-flight fetch.
          // If so, drop the result instead of re-caching it after invalidation.
          if (this._invalidatedKeys.has(key)) {
            this._invalidatedKeys.delete(key);
            console.log(`🚫 Dropped in-flight result for invalidated key ${key.slice(0, 8)}...`);
            return resultData;
          }
          this.set(key, resultData, { repoUrl, isMock });
          return resultData;
        }).catch(err => {
          this.pending.delete(key);
          this._invalidatedKeys.delete(key);
          throw err;
        });

        this.pending.set(key, { promise, repoUrl });
        return promise;
      });
    } finally {
      if (lock.isFree()) {
        this._locks.delete(key);
      }
    }
  }

  /**
   * Clear all mock entries from the cache (used when AI engine recovers).
   */
  clearMockEntries() {
    let cleared = 0;
    for (const [key, entry] of this.cache) {
      if (entry.isMock) {
        this.cache.delete(key);
        if (entry.repoUrl) {
          const normalizedUrl = entry.repoUrl.replace(/\/+$/, '').toLowerCase();
          const index = this._repoUrlIndex.get(normalizedUrl);
          if (index) {
            index.delete(key);
            if (index.size === 0) {
              this._repoUrlIndex.delete(normalizedUrl);
            }
          }
        }
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
    this._repoUrlIndex.clear();
    // No restart here: the sweeper starts lazily again on the next set().
    console.log(`🗑️  Cleared analysis cache (${size} entries removed)`);
  }

  /**
   * Get cache statistics for monitoring and debugging.
   */
  _startSweeper(intervalMs = 60000) {
    if (this._sweeper) return;
    this._sweeper = registerTimer(setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache) {
        // Check absolute max TTL first — entries that have lived too long
        // are evicted regardless of access pattern
        if (now > entry.absoluteExpiresAt) {
          this.cache.delete(key);
          this.stats.absoluteExpiries++;
          if (entry.repoUrl && this._repoUrlIndex.has(entry.repoUrl)) {
            const set = this._repoUrlIndex.get(entry.repoUrl);
            set.delete(key);
            if (set.size === 0) {
              this._repoUrlIndex.delete(entry.repoUrl);
            }
          }
          continue;
        }
        if (now > entry.expiresAt) {
          this.cache.delete(key);
          this.stats.slidingExpiries++;
          if (entry.repoUrl && this._repoUrlIndex.has(entry.repoUrl)) {
            const set = this._repoUrlIndex.get(entry.repoUrl);
            set.delete(key);
            if (set.size === 0) {
              this._repoUrlIndex.delete(entry.repoUrl);
            }
          }
        }
      }
      this._cleanupIdleLocks();
      if (this.cache.size === 0) {
        // Nothing left to sweep — release the interval so idle instances
        // (or instances being garbage-collected without clear()) cannot
        // keep a live timer via the sweeper closure.
        this._stopSweeper();
      }
    }, intervalMs));
    if (this._sweeper.unref) this._sweeper.unref();
  }

  _cleanupIdleLocks() {
    // Per-key locks are stored indefinitely after first use. Reclaim the ones
    // that are no longer held so the map does not grow without bound.
    for (const [key, lock] of this._locks) {
      if (lock.isFree()) {
        this._locks.delete(key);
      }
    }
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
      const createdAt = entry.createdAt || (entry.expiresAt - this.ttlMs);
      totalAge += Date.now() - createdAt;
      if (entry.isMock) mockCount++;
    }

    return {
      size: this.cache.size,
      maxEntries: this.maxEntries,
      hits: this.stats.hits,
      misses: this.stats.misses,
      mockCount,
      avgAgeMs: this.cache.size > 0 ? Math.round(totalAge / this.cache.size) : 0,
      evictions: Number.isFinite(this.stats.evictions) ? this.stats.evictions : 0,
      absoluteExpiries: this.stats.absoluteExpiries,
      slidingExpiries: this.stats.slidingExpiries,
      hitRate: `${hitRate}%`,
      ttlMinutes: this.ttlMs / 1000 / 60,
      absoluteMaxMultiplier: this.absoluteMaxMultiplier,
      absoluteMaxMinutes: (this.ttlMs * this.absoluteMaxMultiplier) / 1000 / 60,
      mockTtlSeconds: this.mockTtlMs / 1000,
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
    let removed = 0;
    if (keys && keys.size > 0) {
      for (const key of keys) {
        if (this.cache.delete(key)) {
          removed++;
        }
      }
      this._repoUrlIndex.delete(normalized);
    }
    // Also evict in-flight pending fetches for this repo URL so a subsequent
    // /api/analyze does not reuse a stale dedup promise (or re-cache a result
    // that raced with the invalidation).
    for (const [key, entry] of this.pending) {
      if (entry.repoUrl) {
        const entryNormalized = entry.repoUrl.replace(/\/+$/, '').toLowerCase();
        if (entryNormalized === normalized) {
          this._invalidatedKeys.add(key);
          this.pending.delete(key);
          removed++;
        }
      }
    }
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
