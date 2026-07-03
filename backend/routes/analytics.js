import { Router } from 'express';
import { requireApiKey } from '../utils/authMiddleware.js';
import { ensureConnection } from '../config/db.js';
import Analytics from '../models/Analytics.js';

const router = Router();

router.get('/api/analytics/trends', requireApiKey, async (req, res) => {
  try {
    await ensureConnection();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const matchFilter = {
      analyzedAt: { $gte: thirtyDaysAgo },
    };

    if (req.query.sessionId) {
      matchFilter.sessionId = String(req.query.sessionId);
    }

    const trends = await Analytics.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$analyzedAt' } },
          analyses: { $sum: 1 },
          totalFindings: { $sum: '$totalFindings' },
          avgHealthScore: { $avg: '$healthScore' },
          totalBugs: { $sum: '$totalBugs' },
          totalSecurityIssues: { $sum: '$totalSecurityIssues' },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          date: '$_id',
          analyses: 1,
          totalFindings: 1,
          avgHealthScore: { $round: ['$avgHealthScore', 1] },
          totalBugs: 1,
          totalSecurityIssues: 1,
        },
      },
    ]);

    return res.json({ trends });
  } catch (err) {
    console.error('❌ Analytics Trends Error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve analytics trends.' });
  }
});

export default router;
