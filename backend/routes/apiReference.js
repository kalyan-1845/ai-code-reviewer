import express from 'express';
import { llmAnalysisLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Mock controller for demonstration
const analyzeController = (req, res) => {
  res.json({ success: true, message: "Analysis started." });
};

// Map llmAnalysisLimiter specifically to heavy endpoints to avoid blocking standard, lightweight API routes
router.post('/analyze', llmAnalysisLimiter, analyzeController);

export default router;
