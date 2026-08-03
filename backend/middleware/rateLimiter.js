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
