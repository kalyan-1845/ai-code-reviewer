import { CircuitBreaker } from './circuitBreaker.js';

class ReviewQueue {
  constructor(maxQueues = 100, maxItemsPerQueue = 50, exclusiveLockTtlMs = 30 * 60 * 1000, maxRetries = 3) {
    this._queues = new Map();
    this._queueLocks = new Map();
    this._exclusiveLocks = new Map();
    this._exclusiveLocksTimestamps = new Map();
    this._maxQueues = maxQueues;
    this._maxItemsPerQueue = maxItemsPerQueue;
    this._exclusiveLockTtlMs = exclusiveLockTtlMs;
    this._maxRetries = maxRetries;
    this._circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      cooldownMs: 30000,
      halfOpenMaxRequests: 3,
      timeoutMs: 10000,
    });
  }

  getCircuitState() {
    return {
      state: this._circuitBreaker.getState(),
    };
  }

  async enqueue(key, item, processor) {
    const prev = this._queueLocks.get(key) || Promise.resolve();
    const next = prev.then(async () => {
      if (!this._queues.has(key)) {
        if (this._queues.size >= this._maxQueues) {
          console.warn(`ReviewQueue: dropping item for "${key}" — queue limit (${this._maxQueues}) reached`);
          return;
        }
        this._queues.set(key, []);
      }
      const queue = this._queues.get(key);
      if (queue.length >= this._maxItemsPerQueue) {
        console.warn(`ReviewQueue: dropping item for "${key}" — per-queue limit (${this._maxItemsPerQueue}) reached`);
        return;
      }
      queue.push(item);
    });
    this._queueLocks.set(key, next.catch(err => {
      console.error(`ReviewQueue enqueue error for "${key}":`, err);
    }));
    return next.then(() => this._processNext(key, processor));
  }

  async _processNext(key, processor) {
    const prev = this._queueLocks.get(key) || Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(async () => {
        const queue = this._queues.get(key);
        if (!queue || queue.length === 0) {
          this._queueLocks.delete(key);
          return;
        }
        while (queue.length > 0) {
          const item = queue.shift();
          for (let attempt = 0; attempt <= this._maxRetries; attempt++) {
            try {
              await this._circuitBreaker.call(() => processor(item));
              break;
            } catch (err) {
              if (err.name === 'CircuitBreakerOpenError') {
                console.error(`ReviewQueue: circuit breaker OPEN for "${key}", requeuing item`);
                queue.unshift(item);
                break;
              }
              if (attempt < this._maxRetries) {
                const delay = Math.pow(2, attempt) * 1000;
                console.warn(`ReviewQueue: retry ${attempt + 1}/${this._maxRetries} for "${key}" in ${delay}ms:`, err.message);
                await new Promise(r => setTimeout(r, delay));
              } else {
                console.error(`ReviewQueue: item permanently failed for "${key}" after ${this._maxRetries + 1} attempts:`, err);
                this._circuitBreaker.onFailure();
              }
            }
          }
        }
        // Two-phase check: only delete the queue if it is still empty.
        // Prevents race window A (item enqueued after last shift but before delete)
        // and race window B (concurrent enqueue/_processNext chain reading a deleted queue).
        const finalQueue = this._queues.get(key);
        if (!finalQueue || finalQueue.length === 0) {
          this._queueLocks.delete(key);
          this._queues.delete(key);
        }
      });
    this._queueLocks.set(key, next.catch(err => {
      console.error(`ReviewQueue processing error for "${key}":`, err);
    }));
    return next;
  }

  // Per-key mutex: ensures only one async operation runs at a time for a given key.
  // Unlike enqueue(), this does not use a queue — it simply chains onto the previous
  // operation for the same key. Useful for serializing database read-then-write
  // operations to prevent lost updates (see issue #746).
  async runExclusive(key, fn) {
    const prev = this._exclusiveLocks.get(key) || Promise.resolve();
    const next = prev.then(async () => {
      try {
        return await fn();
      } finally {
        const current = this._exclusiveLocks.get(key);
        if (current === wrappedPromise) {
          this._exclusiveLocks.delete(key);
          this._exclusiveLocksTimestamps.delete(key);
        }
      }
    });
    const wrappedPromise = next.catch(err => {
      console.error(`ReviewQueue exclusive processing error for "${key}":`, err);
    });
    this._exclusiveLocks.set(key, wrappedPromise);
    this._exclusiveLocksTimestamps.set(key, { createdAt: Date.now() });
    return next;
  }

  cleanupStaleExclusiveLocks(maxAgeMs) {
    const now = Date.now();
    for (const [key, entry] of this._exclusiveLocksTimestamps) {
      if (now - entry.createdAt > maxAgeMs) {
        this._exclusiveLocks.delete(key);
        this._exclusiveLocksTimestamps.delete(key);
      }
    }
  }
}

export default ReviewQueue;
