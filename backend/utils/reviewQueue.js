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
    this._circuitBreakers = new Map();
    this._circuitBreakerTimestamps = new Map();
  }

  _getCircuitBreaker(key) {
    if (!this._circuitBreakers.has(key)) {
      this._circuitBreakers.set(key, new CircuitBreaker({
        failureThreshold: 5,
        cooldownMs: 30000,
        halfOpenMaxRequests: 3,
        timeoutMs: 10000,
      }));
      this._circuitBreakerTimestamps.set(key, Date.now());
    }
    this._circuitBreakerTimestamps.set(key, Date.now());
    return this._circuitBreakers.get(key);
  }

  getCircuitState() {
    const states = {};
    for (const [key, cb] of this._circuitBreakers) {
      states[key] = cb.getState();
    }
    return { states };
  }

  cleanupStaleCircuitBreakers(maxAgeMs = 5 * 60 * 1000) {
    const now = Date.now();
    for (const [key, timestamp] of this._circuitBreakerTimestamps) {
      if (now - timestamp > maxAgeMs) {
        this._circuitBreakers.delete(key);
        this._circuitBreakerTimestamps.delete(key);
      }
    }
  }

  async enqueue(key, item, processor) {
    let dropped = false;
    const prev = this._queueLocks.get(key) || Promise.resolve();
    const next = prev.then(async () => {
      if (!this._queues.has(key)) {
        if (this._queues.size >= this._maxQueues) {
          console.warn(`ReviewQueue: dropping item for "${key}" — queue limit (${this._maxQueues}) reached`);
          dropped = true;
          return;
        }
        this._queues.set(key, []);
      }
      const queue = this._queues.get(key);
      if (queue.length >= this._maxItemsPerQueue) {
        console.warn(`ReviewQueue: dropping item for "${key}" — per-queue limit (${this._maxItemsPerQueue}) reached`);
        dropped = true;
        return;
      }
      queue.push(item);
    });
    this._queueLocks.set(key, next.catch(err => {
      console.error(`ReviewQueue enqueue error for "${key}":`, err);
    }));
    return next.then(() => dropped ? false : this._processNext(key, processor));
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
          const circuitBreaker = this._getCircuitBreaker(key);
          let permanentlyFailed = false;

          for (let attempt = 0; attempt <= this._maxRetries; attempt++) {
            try {
              await circuitBreaker.call(() => processor(item));
              break;
            } catch (err) {
              if (err.name === 'CircuitBreakerOpenError') {
                const cooldownRemaining = Math.max(
                  (circuitBreaker._cooldownMs || 30000) - (Date.now() - circuitBreaker._lastFailureTime),
                  0
                );
                console.error(
                  `ReviewQueue: circuit breaker OPEN for "${key}", ` +
                  `waiting ${Math.ceil(cooldownRemaining / 1000)}s before retry`
                );

                if (queue.length > 0) {
                  queue.unshift(item);
                  break;
                }

                await new Promise(r => setTimeout(r, cooldownRemaining + 1000));
                queue.unshift(item);
                break;
              }
              if (attempt < this._maxRetries) {
                const delay = Math.pow(2, attempt) * 1000;
                console.warn(`ReviewQueue: retry ${attempt + 1}/${this._maxRetries} for "${key}" in ${delay}ms:`, err.message);
                await new Promise(r => setTimeout(r, delay));
              } else {
                console.error(`ReviewQueue: item permanently failed for "${key}" after ${this._maxRetries + 1} attempts:`, err);
                circuitBreaker.onFailure();
                permanentlyFailed = true;
              }
            }
          }

          if (permanentlyFailed) {
            continue;
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
  // Unlike enqueue(), this does not use a queue — it awaits any existing operation
  // for the same key before starting the new one. This prevents lost updates and
  // race conditions from concurrent read-modify-write on shared resources.
  async runExclusive(key, fn) {
    const existing = this._exclusiveLocks.get(key);
    if (existing) {
      // Wait for the existing operation to complete before starting a new one
      await existing;
    }
    const next = (async () => {
      try {
        return await fn();
      } finally {
        this._exclusiveLocks.delete(key);
        this._exclusiveLocksTimestamps.delete(key);
      }
    })();
    this._exclusiveLocks.set(key, next);
    this._exclusiveLocksTimestamps.set(key, { createdAt: Date.now() });
    return next;
  }

  cleanupStaleExclusiveLocks(maxAgeMs) {
    const now = Date.now();
    for (const [key, entry] of this._exclusiveLocksTimestamps) {
      if (now - entry.createdAt > maxAgeMs) {
        console.warn(`ReviewQueue: stale lock detected for "${key}", awaiting completion`);
        // Don't delete — let the operation finish naturally to avoid breaking the
        // mutex guarantee. The finally block in runExclusive will clean up.
      }
    }
  }
}

export default ReviewQueue;
