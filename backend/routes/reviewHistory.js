import { Router } from 'express';
import mongoose from 'mongoose';
import { requireApiKey } from '../utils/authMiddleware.js';
import Analytics from '../models/Analytics.js';

const router = Router();

router.get('/api/review-history', requireApiKey, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [history, total] = await Promise.all([
      Analytics.find()
        .sort({ analyzedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Analytics.countDocuments({})
    ]);

    res.json({
      success: true,
      history,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch review history.' });
  }
});

router.get('/api/review-history/:repo', requireApiKey, async (req, res) => {
  try {
    const repo = req.params.repo;
    if (typeof repo !== 'string' || repo.length === 0) {
      return res.status(400).json({ error: 'Invalid repo parameter.' });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const [history, total] = await Promise.all([
      Analytics.find({ repoName: repo })
        .sort({ analyzedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Analytics.countDocuments({ repoName: repo })
    ]);

    res.json({
      success: true,
      history,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch repository history.' });
  }
});

router.get('/api/review-history/compare/:id1/:id2', requireApiKey, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id1) || !mongoose.Types.ObjectId.isValid(req.params.id2)) {
      return res.status(400).json({ error: 'Invalid ID format.' });
    }

    const first = await Analytics.findById(req.params.id1);
    const second = await Analytics.findById(req.params.id2);

    if (!first || !second) {
      return res.status(404).json({ error: 'Review not found.' });
    }

    res.json({
      previous: first,
      current: second,
      difference: {
        healthScore: second.healthScore - first.healthScore,
        findings: second.totalFindings - first.totalFindings,
        bugs: second.totalBugs - first.totalBugs,
        security: second.totalSecurityIssues - first.totalSecurityIssues,
        optimization: second.totalOptimizations - first.totalOptimizations
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Comparison failed.' });
  }
});

export default router;
