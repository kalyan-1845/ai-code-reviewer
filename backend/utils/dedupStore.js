class DedupStore {
  constructor(redisClient) {
    this.redisClient = redisClient;
    this.memoryStore = new Map();
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

  async addToSet(key, member) {
    if (this.redisClient) {
      try {
        await this.redisClient.sadd(key, member);
        return;
      } catch (err) {
        console.warn(`⚠️ Redis sadd failed for ${key}, falling back to memory:`, err.message);
      }
    }
    if (!this.memoryStore.has(key)) {
      this.memoryStore.set(key, { value: new Set(), expiresAt: Infinity });
    }
    this.memoryStore.get(key).value.add(member);
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
    if (!entry) return false;
    return entry.value.has(member);
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
    if (entry) {
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
}

export default DedupStore;
