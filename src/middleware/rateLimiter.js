import redis from '../config/redis.js';

const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local refill_interval = tonumber(ARGV[3])
local now = tonumber(ARGV[4])
local requested = tonumber(ARGV[5] or 1)

local data = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens = tonumber(data[1])
local last_refill = tonumber(data[2])

if not tokens or not last_refill then
    tokens = capacity
    last_refill = now
else
    local elapsed = math.max(0, now - last_refill)
    local tokens_to_add = elapsed * (refill_rate / refill_interval)
    tokens = math.min(capacity, tokens + tokens_to_add)
    last_refill = now
end

local allowed = 0
if tokens >= requested then
    tokens = tokens - requested
    allowed = 1
end

redis.call('HMSET', key, 'tokens', tokens, 'last_refill', last_refill)
redis.call('EXPIRE', key, math.ceil(refill_interval * 2))

return { allowed, math.floor(tokens), capacity }
`;

export const webhookRateLimiter = async (req, res, next) => {
  try {
    const repoId = req.body?.repository?.id;
    const installationId = req.body?.installation?.id;

    const identifier = repoId ? `repo:${repoId}` : installationId ? `install:${installationId}` : null;
    if (!identifier) {
      return next();
    }

    const key = `ratelimit:${identifier}`;
    const capacity = parseInt(process.env.RATE_LIMIT_CAPACITY || '5', 10);
    const refillRate = parseInt(process.env.RATE_LIMIT_REFILL_RATE || '5', 10);
    const refillInterval = parseInt(process.env.RATE_LIMIT_REFILL_INTERVAL || '3600', 10);
    const now = Math.floor(Date.now() / 1000);

    const result = await redis.eval(
      TOKEN_BUCKET_LUA,
      1,
      key,
      capacity,
      refillRate,
      refillInterval,
      now,
      1
    );

    const [allowed, remainingTokens, limit] = result;

    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, remainingTokens));

    if (allowed === 1) {
      return next();
    }

    return res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Token bucket depleted for this repository.'
    });
  } catch (error) {
    console.error('[RateLimiter] Error executing token bucket rate limiter:', error);
    return next();
  }
};
