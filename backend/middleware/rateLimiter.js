import rateLimit from 'express-rate-limit';

export const llmAnalysisLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many analysis requests from this IP, please try again after 15 minutes."
  }
});

const concurrentRequestsMap = new Map();
const MAX_CONCURRENT_REQUESTS_PER_USER = parseInt(process.env.MAX_CONCURRENT_REQUESTS_PER_USER || '3', 10);

export const concurrencyThrottleMiddleware = (req, res, next) => {
  const clientId = req.clientId;

  if (!clientId) {
    return next();
  }

  if (!concurrentRequestsMap.has(clientId)) {
    concurrentRequestsMap.set(clientId, 0);
  }

  const currentCount = concurrentRequestsMap.get(clientId);

  if (currentCount >= MAX_CONCURRENT_REQUESTS_PER_USER) {
    return res.status(429).json({
      success: false,
      error: `User has reached maximum concurrent requests (${MAX_CONCURRENT_REQUESTS_PER_USER}). Please wait for previous requests to complete.`
    });
  }

  concurrentRequestsMap.set(clientId, currentCount + 1);

  // Release the slot exactly once when the request finishes. A client that
  // disconnects, aborts, or times out never fires `finish`, so also listen for
  // `close` / `aborted`; the guard flag prevents a request that both closes and
  // finishes from being double-decremented. Without these handlers every
  // aborted request would leave a permanent entry in concurrentRequestsMap
  // (unbounded in-memory growth and stale elevated counts → false 429s).
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const newCount = (concurrentRequestsMap.get(clientId) || 1) - 1;
    if (newCount <= 0) {
      concurrentRequestsMap.delete(clientId);
    } else {
      concurrentRequestsMap.set(clientId, newCount);
    }
  };

  res.on('finish', release);
  res.on('close', release);
  req.on('aborted', release);

  next();
};

/**
 * Token Bucket Rate Limiter for GitHub Webhook Ingestion.
 * Scoped to repository.id or installation.id from req.body.
 * Default limit: 5 requests per hour (3,600,000 ms) per repository.
 * Fails open if Redis or processing encounters an error.
 */
export const createWebhookRateLimiter = (options = {}) => {
  const {
    redisClient = null,
    maxTokens = 5,
    windowMs = 3600 * 1000,
    getRedisClient = null,
  } = options;
  const fillRate = maxTokens / windowMs;
  const inMemoryBuckets = new Map();

  return async (req, res, next) => {
    try {
      const repoId =
        req.body?.repository?.id ??
        req.body?.installation?.id ??
        req.body?.repository?.full_name ??
        req.body?.repository?.name;

      if (!repoId) {
        return next();
      }

      const now = Date.now();
      const key = `ratelimit:webhook:tokenbucket:${repoId}`;

      let client = null;
      if (typeof getRedisClient === 'function') {
        client = getRedisClient();
      } else if (redisClient) {
        client = redisClient;
      } else if (req.app && typeof req.app.get === 'function') {
        client = req.app.get('redisClient');
      }

      if (client) {
        try {
          const data = await client.hgetall(key);
          let tokens = data && data.tokens !== undefined ? parseFloat(data.tokens) : maxTokens;
          let lastRefill = data && data.lastRefill !== undefined ? parseInt(data.lastRefill, 10) : now;

          const elapsed = Math.max(0, now - lastRefill);
          tokens = Math.min(maxTokens, tokens + elapsed * fillRate);

          if (tokens >= 1) {
            tokens -= 1;
            if (typeof client.pipeline === 'function') {
              const pipeline = client.pipeline();
              pipeline.hset(key, 'tokens', tokens.toString(), 'lastRefill', now.toString());
              pipeline.expire(key, Math.ceil(windowMs / 1000));
              await pipeline.exec();
            } else {
              await client.hset(key, 'tokens', tokens.toString(), 'lastRefill', now.toString());
              if (typeof client.expire === 'function') {
                await client.expire(key, Math.ceil(windowMs / 1000));
              }
            }
            return next();
          } else {
            return res.status(429).json({
              error: 'Rate limit exceeded. Maximum 5 PR reviews per hour per repository.'
            });
          }
        } catch (redisErr) {
          console.error('[RateLimiter] Redis error in token bucket, failing open:', redisErr.message);
          return next();
        }
      } else {
        // Fallback to in-memory Token Bucket when Redis client is not available
        let bucket = inMemoryBuckets.get(repoId);
        if (!bucket) {
          bucket = { tokens: maxTokens, lastRefill: now };
        } else {
          const elapsed = Math.max(0, now - bucket.lastRefill);
          bucket.tokens = Math.min(maxTokens, bucket.tokens + elapsed * fillRate);
        }

        if (bucket.tokens >= 1) {
          bucket.tokens -= 1;
          bucket.lastRefill = now;
          inMemoryBuckets.set(repoId, bucket);
          return next();
        } else {
          return res.status(429).json({
            error: 'Rate limit exceeded. Maximum 5 PR reviews per hour per repository.'
          });
        }
      }
    } catch (err) {
      console.error('[RateLimiter] Unexpected error in token bucket rate limiter, failing open:', err);
      return next();
    }
  };
};

export const webhookRateLimiter = createWebhookRateLimiter();
