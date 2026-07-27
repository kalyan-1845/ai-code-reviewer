import express from 'express';
import { llmAnalysisLimiter } from '../middleware/rateLimiter.js';

const app = express();
const router = express.Router();

// Trust proxy is required when the app is deployed behind a reverse proxy/load balancer (e.g., Vercel, Heroku, Nginx, AWS ELB).
// It ensures express-rate-limit correctly identifies the client IP from the X-Forwarded-For header, rather than blocking the proxy's IP.
app.set('trust proxy', 1); 

// Mock controller for demonstration
const analyzeController = (req, res) => {
  res.json({ success: true, message: "Analysis started." });
};

// Map llmAnalysisLimiter specifically to heavy endpoints to avoid blocking standard, lightweight API routes
router.post('/analyze', llmAnalysisLimiter, analyzeController);

app.use('/api', router);

export default app;
