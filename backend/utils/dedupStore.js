import { registerTimer } from './timerRegistry.js';

class DedupStore {
  constructor(redisClient) {
    this.redisClient = redisClient;
    this.memoryStore = new Map();
    this._locks = new Map();
    this._sweeper = null;
    this._startSweeper();
  }

  get size() {
    return this.memoryStore.size;
  }

  // Atomic check-and-set: returns true if key already exists, false if set was performed
  async checkAndSet(key, value, ttlMs) {
    if (this.redisClient) {
      try {
        const result = await this.redisClient.set(key, value, 'NX', 'PX', ttlMs);
        return result === null;
      } catch (err) {
        console.warn(`⚠️ Redis checkAndSet failed for ${key}, falling back to memory:`, err.message);
      }
    }
    while (this._locks.has(key)) {
      await this._locks.get(key);
    }
    const next = (async () => {
      const entry = this.memoryStore.get(key);
      if (entry && Date.now() <= entry.expiresAt) return true;
      this.memoryStore.set(key, { value, expiresAt: Date.now() + ttlMs });
      return false;
    })();
    this._locks.set(key, next.finally(() => {
      if (this._locks.get(key) === next) this._locks.delete(key);
    }));
    return next;
  }

  async set(key, value, ttlMs) {
    if (this.redisClient) {
      try {
        await this.redisClient.set(key, value, 'PX', ttlMs);
        return;
      } catch (err) {
        console.warn(`⚠️ Redis set failed for ${key}, falling back to memory:`, err.message);
      }
    }
    this.memoryStore.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  async get(key) {
    if (this.redisClient) {
      try {
        const val = await this.redisClient.get(key);
        if (val !== null && val !== undefined) return val;
      } catch (err) {
        console.warn(`⚠️ Redis get failed for ${key}, falling back to memory:`, err.message);
      }
    }
    const entry = this.memoryStore.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.memoryStore.delete(key);
      return null;
    }
    return entry.value;
  }

  async has(key) {
    const val = await this.get(key);
    return val !== null && val !== undefined;
  }

  async addToSet(key, member, ttlMs = 3600000) {
    if (this.redisClient) {
      try {
        const pipeline = this.redisClient.pipeline();
        pipeline.sadd(key, member);
        pipeline.pexpire(key, ttlMs);
        await pipeline.exec();
        return;
      } catch (err) {
        console.warn(`⚠️ Redis sadd failed for ${key}, falling back to memory:`, err.message);
      }
    }
    if (!this.memoryStore.has(key) || !(this.memoryStore.get(key).value instanceof Set)) {
      this.memoryStore.set(key, { value: new Set(), expiresAt: Date.now() + ttlMs });
    }
    const entry = this.memoryStore.get(key);
    if (Date.now() > entry.expiresAt) {
      this.memoryStore.delete(key);
      return;
    }
    entry.value.add(member);
  }

  async isMember(key, member) {
    if (this.redisClient) {
      try {
        const result = await this.redisClient.sismember(key, member);
        return result === 1;
      } catch (err) {
        console.warn(`⚠️ Redis sismember failed for ${key}, falling back to memory:`, err.message);
      }
    }
    const entry = this.memoryStore.get(key);
    if (!entry || !(entry.value instanceof Set)) return false;
    if (Date.now() > entry.expiresAt) {
      this.memoryStore.delete(key);
      return false;
    }
    return entry.value instanceof Set ? entry.value.has(member) : false;
  }

  async removeFromSet(key, member) {
    if (this.redisClient) {
      try {
        await this.redisClient.srem(key, member);
        return;
      } catch (err) {
        console.warn(`⚠️ Redis srem failed for ${key}, falling back to memory:`, err.message);
      }
    }
    const entry = this.memoryStore.get(key);
    if (!entry) return;
    if (Date.now() > entry.expiresAt) {
      this.memoryStore.delete(key);
      return;
    }
    if (entry.value instanceof Set) {
      entry.value.delete(member);
    }
  }

  async expire(key, ttlMs) {
    if (this.redisClient) {
      try {
        await this.redisClient.pexpire(key, ttlMs);
        return;
      } catch (err) {
        console.warn(`⚠️ Redis expire failed for ${key}, falling back to memory:`, err.message);
      }
    }
    const entry = this.memoryStore.get(key);
    if (entry) {
      entry.expiresAt = Date.now() + ttlMs;
    }
  }

  async delete(key) {
    if (this.redisClient) {
      try {
        await this.redisClient.del(key);
        return;
      } catch (err) {
        console.warn(`⚠️ Redis del failed for ${key}, falling back to memory:`, err.message);
      }
    }
    this.memoryStore.delete(key);
  }

  _startSweeper(intervalMs = 60000) {
    if (this._sweeper) return;
    this._sweeper = registerTimer(setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.memoryStore) {
        if (now > entry.expiresAt) {
          this.memoryStore.delete(key);
        }
      }
    }, intervalMs));
    if (this._sweeper.unref) this._sweeper.unref();
  }

  stopSweeper() {
    if (this._sweeper) {
      clearInterval(this._sweeper);
      this._sweeper = null;
    }
  }
}

export default DedupStore;
