import { Router } from 'express';
import { requireApiKey } from '../utils/authMiddleware.js';
import { analysisCache } from './context.js';

const router = Router();

router.post('/api/cache/invalidate', requireApiKey, async (req, res) => {
  const { repoUrl } = req.body;
  if (!repoUrl) {
    return res.status(400).json({ error: 'repoUrl is required.' });
  }
  const removed = analysisCache.invalidateByRepoUrl(repoUrl);
  res.json({ success: true, removed, stats: analysisCache.getStats() });
});

export default router;
