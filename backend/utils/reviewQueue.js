class ReviewQueue {
  constructor() {
    this._queues = new Map();
    this._locks = new Map();
  }

  async enqueue(key, item, processor) {
    if (!this._queues.has(key)) {
      this._queues.set(key, []);
    }
    this._queues.get(key).push(item);
    return this._processNext(key, processor);
  }

  async _processNext(key, processor) {
    const prev = this._locks.get(key) || Promise.resolve();
    const next = prev.then(async () => {
      const queue = this._queues.get(key);
      if (!queue || queue.length === 0) return;
      while (queue.length > 0) {
        const item = queue.shift();
        try {
          await processor(item);
        } catch (err) {
          console.error(`Review processing failed for ${key}:`, err);
        }
      }
      this._queues.delete(key);
      this._locks.delete(key);
    });
    this._locks.set(key, next.catch(() => {}));
    return next;
  }

  // Per-key mutex: ensures only one async operation runs at a time for a given key.
  // Unlike enqueue(), this does not use a queue — it simply chains onto the previous
  // operation for the same key. Useful for serializing database read-then-write
  // operations to prevent lost updates (see issue #746).
  async runExclusive(key, fn) {
    const prev = this._locks.get(key) || Promise.resolve();
    const next = prev.then(async () => {
      try {
        return await fn();
      } finally {
        this._locks.delete(key);
      }
    });
    this._locks.set(key, next.catch(() => {}));
    return next;
  }
}

export default ReviewQueue;
