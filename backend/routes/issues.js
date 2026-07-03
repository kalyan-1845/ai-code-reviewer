import { Router } from 'express';
import { Octokit } from '@octokit/rest';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { requireApiKey } from '../utils/authMiddleware.js';
import { isValidRepoUrl, parseRepoUrl } from '../utils/urlValidator.js';
import { redisClient } from './context.js';

const issueLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisClient ? new RedisStore({ sendCommand: (...args) => redisClient.call(...args) }) : undefined,
  message: { error: 'Too many issue creation requests.' }
});

const router = Router();

router.post('/api/issues/create', requireApiKey, issueLimiter, async (req, res) => {
  const { repoUrl, title, body, labels = [] } = req.body;
  const token = process.env.GITHUB_PAT;

  if (!token) {
    return res.status(400).json({ error: 'GITHUB_PAT is not configured in backend/.env.' });
  }

  if (!title || typeof title !== 'string' || title.length < 1 || title.length > 256) {
    return res.status(400).json({ error: 'Title is required and must be 1-256 characters.' });
  }
  if (!body || typeof body !== 'string' || body.length < 1 || body.length > 65536) {
    return res.status(400).json({ error: 'Body is required and must be 1-65536 characters.' });
  }
  if (!Array.isArray(labels)) {
    return res.status(400).json({ error: 'Labels must be an array.' });
  }
  if (labels.length > 10) {
    return res.status(400).json({ error: 'Maximum 10 labels allowed.' });
  }
  for (const label of labels) {
    if (typeof label !== 'string' || label.length > 50) {
      return res.status(400).json({ error: 'Each label must be a string of at most 50 characters.' });
    }
  }

  if (!isValidRepoUrl(repoUrl)) {
    return res.status(400).json({ error: 'Invalid GitHub repository URL. Only https://github.com/owner/repo URLs are allowed.' });
  }
  const parsed = parseRepoUrl(repoUrl);
  const owner = parsed.owner;
  const repo = parsed.repo;

  try {
    const octokit = new Octokit({ auth: token });

    console.log(`🤖 Creating GitHub Issue in ${owner}/${repo}: "${title}"`);

    const response = await octokit.rest.issues.create({
      owner,
      repo,
      title,
      body,
      labels
    });

    return res.json({
      success: true,
      issueUrl: response.data.html_url,
      number: response.data.number
    });
  } catch (err) {
    console.error('❌ Create GitHub Issue Error:', err.message);
    return res.status(500).json({ error: `Failed to create issue: ${err.message}` });
  }
});

export default router;
