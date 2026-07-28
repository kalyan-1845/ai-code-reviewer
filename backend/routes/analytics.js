/**
 * backend/routes/analytics.js
 * ----------------------------
 * Analytics REST API router.
 *
 * Endpoints:
 *   GET /api/analytics/overview  — Aggregated MI scores, vuln density, total lines reviewed.
 *   GET /api/analytics/trends    — Time-series MI & complexity data over a look-back window.
 */

import express from 'express';
import {
  loadAllRecords,
  computeOverview,
  computeTrends,
} from '../services/analyticsAggregator.js';

const router = express.Router();

/**
 * GET /api/analytics/overview
 *
 * Returns macro-level aggregated metrics across all stored run snapshots:
 *   - totalRuns
 *   - totalLinesReviewed
 *   - avgMaintainabilityIndex  (MI formula)
 *   - maintainabilityGrade     (High / Moderate / Low)
 *   - avgCyclomaticComplexity
 *   - vulnerabilityDensity     (security issues per 1000 lines)
 *   - totalSecurityIssues
 *   - totalBugs
 */
router.get('/overview', async (req, res) => {
  try {
    const records = loadAllRecords();
    const overview = computeOverview(records);
    return res.json({ overview });
  } catch (err) {
    console.error('[Analytics] /overview error:', err.message);
    return res.status(500).json({ error: 'Failed to compute analytics overview.' });
  }
});

/**
 * GET /api/analytics/trends
 *
 * Query params:
 *   ?days=30   (default 30, max 365) — look-back window in calendar days.
 *
 * Returns time-series array grouped by calendar day (UTC):
 *   [{ date, runs, avgMaintainabilityIndex, avgCyclomaticComplexity,
 *      totalLinesReviewed, totalSecurityIssues, totalBugs }, ...]
 */
router.get('/trends', async (req, res) => {
  try {
    const rawDays = parseInt(req.query.days, 10);
    const days = (!Number.isNaN(rawDays) && rawDays > 0) ? Math.min(rawDays, 365) : 30;

    const records = loadAllRecords();
    const trends  = computeTrends(records, days);
    return res.json({ trends, lookbackDays: days });
  } catch (err) {
    console.error('[Analytics] /trends error:', err.message);
    return res.status(500).json({ error: 'Failed to compute analytics trends.' });
  }
});

export default router;
