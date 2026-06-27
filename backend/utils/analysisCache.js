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
    // Default TTL: 1 hour (3600000 ms)
    this.ttlMs = ttlMs;
    this.cache = new Map();
    this.stats = { hits: 0, misses: 0 };
  }

  /**
   * Generate a deterministic cache key from analysis parameters.
   * Includes repoUrl, file hashes, model, language, and other params.
   */
  generateKey(repoUrl, files, params = {}) {
    const { model = 'llama-3.3-70b-versatile', language = 'English', company = 'General' } = params;

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

    const keyData = `${repoUrl}|${filesHash}|${model}|${language}|${company}`;
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
  set(key, result) {
    const expiresAt = Date.now() + this.ttlMs;
    this.cache.set(key, { result, expiresAt });
    console.log(`💾 Cached analysis result for key ${key.slice(0, 8)}... (expires in ${this.ttlMs / 1000 / 60} minutes)`);
  }

  /**
   * Clear all entries from the cache.
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`🗑️  Cleared analysis cache (${size} entries removed)`);
  }

  /**
   * Get cache statistics for monitoring and debugging.
   */
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? ((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100).toFixed(1)
      : 'N/A';

    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
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
   * Set custom TTL (in milliseconds).
   */
  setTtl(ttlMs) {
    this.ttlMs = ttlMs;
  }
}

export default AnalysisCache;
