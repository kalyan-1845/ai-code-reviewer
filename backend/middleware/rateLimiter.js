import rateLimit from 'express-rate-limit';
import { webhookRateLimiter } from '../src/middleware/rateLimiter.js';

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

export { webhookRateLimiter };

