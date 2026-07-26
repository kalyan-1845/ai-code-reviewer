import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
});

redis.on('connect', () => {
  console.log('[Redis] Connecting to Redis server...');
});

redis.on('ready', () => {
  console.log('[Redis] Connection established successfully.');
});

redis.on('error', (err) => {
  console.error('[Redis] Connection error:', err);
});

export default redis;
