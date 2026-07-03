import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { Octokit } from '@octokit/rest';
import { verifyWebhookSignature } from '../utils/signatureVerifier.js';
import { scanSecretsInChanges } from '../utils/secretsScanner.js';
import { parseDiff } from '../utils/diffParser.js';
import {
  reviewQueue, fetchWithTimeout, redisClient, analysisCache,
  DELIVERY_REDIS_TTL, repoRequestCounts,
  REPO_WINDOW_MS, REPO_MAX_REQUESTS
} from './context.js';

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisClient ? new RedisStore({ sendCommand: (...args) => redisClient.call(...args) }) : undefined,
  message: { error: 'Too many webhook requests.' }
});

setInterval(() => {
  const now = Date.now();
  for (const [key, { count, windowStart }] of repoRequestCounts) {
    if (now - windowStart > REPO_WINDOW_MS) {
      repoRequestCounts.delete(key);
    }
  }
}, 60 * 1000);

async function runWebhookReview(owner, repo, pullNumber, headSha) {
  const token = process.env.GITHUB_PAT;
  if (!token) {
    console.warn("⚠️ GITHUB_PAT not set in backend/.env. Cannot run webhook PR review.");
    return;
  }

  const octokit = new Octokit({ auth: token });
  console.log(`🔍 Fetching diff for PR #${pullNumber}...`);

  const { data: pullRequest } = await octokit.rest.pulls.get({
    owner, repo, pull_number: pullNumber
  });
  if (headSha && pullRequest.head.sha !== headSha) {
    console.log(`⏭️ Skipping stale review ${headSha.substring(0, 7)}; current head is ${pullRequest.head.sha.substring(0, 7)}.`);
    return;
  }

  const { data: diff } = await octokit.rest.pulls.get({
    owner, repo, pull_number: pullNumber,
    mediaType: { format: 'diff' }
  });

  if (!diff) {
    console.warn("⚠️ No diff found for this PR.");
    return;
  }

  const { files: parsedFiles, binaryFiles: parsedBinaryFiles } = parseDiff(diff);
  console.log(`📁 Found ${parsedFiles.length} files in PR diff.`);

  const commentsToPost = [];
  const filesToReview = [];
  const validChangedLines = new Map();

  for (const file of parsedFiles) {
    const ext = file.path.split('.').pop()?.toLowerCase();
    const validExtensions = ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'go', 'rs', 'cpp', 'h', 'cs', 'css', 'html', 'php', 'rb', 'sql'];
    if (!ext || !validExtensions.includes(ext) || file.changes.length === 0) {
      continue;
    }
    validChangedLines.set(file.path, new Set(file.changes.map(change => change.line)));

    const { findings: secretFindings, truncated: scanTruncated, totalChanges: scanTotal, skippedReason: scanReason } = scanSecretsInChanges(file.changes);
    secretFindings.forEach(f => {
      commentsToPost.push({
        path: file.path,
        line: f.line,
        body: `<!-- RepoSage Review Comment -->\n${f.comment}`
      });
    });
    if (scanTruncated) {
      console.warn(`⚠️ Secrets scan truncated for ${file.path}: ${scanReason} (total ${scanTotal} changes)`);
    }

    filesToReview.push({
      path: file.path,
      changes: file.changes.map(c => ({ line: c.line, content: c.content }))
    });
  }

  let aiEngineQueried = false;

  if (filesToReview.length > 0) {
    console.log(`🧠 Querying AI engine for ${filesToReview.length} files...`);
    const aiEngineUrl = process.env.AI_ENGINE_URL || 'http://localhost:8000';

    try {
      const baseUrl = aiEngineUrl.replace(/\/+$/, '');
      const aiResponse = await fetchWithTimeout(`${baseUrl}/review-diff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.REPOSAGE_API_KEY || '' },
        body: JSON.stringify({ files: filesToReview })
      }, 60000);

      if (aiResponse.ok) {
        const result = await aiResponse.json();
        if (result.comments && Array.isArray(result.comments)) {
          result.comments.forEach(c => {
            const validLines = validChangedLines.get(c.path);
            if (!validLines || !validLines.has(Number(c.line))) {
              console.warn(`⚠️ Skipping invalid inline comment location ${c.path}:${c.line}`);
              return;
            }
            const duplicate = commentsToPost.some(exist => exist.path === c.path && exist.line === c.line);
            if (!duplicate) {
              commentsToPost.push(c);
            }
          });
        }
        aiEngineQueried = true;
      }
    } catch (err) {
      console.warn("⚠️ FastAPI AI Engine error, posting local scans only:", err.message);
    }
  }

  if (commentsToPost.length > 0) {
    console.log(`✍️ Posting PR Review with ${commentsToPost.length} inline comments...`);
    let body = `## 🛡️ RepoSage AI Code Review Audit Completed!\n\n`;
    if (!aiEngineQueried && filesToReview.length > 0) {
      body += `⚠️ **Limited Review:** The AI engine was unreachable during this review. Only regex-based secret scanning was performed. AI-powered bug/performance/style analysis was skipped. Please ensure the AI Engine service is running and re-trigger the review for a complete audit.\n\n`;
    }
    body += `I have audited the code changes in this Pull Request and generated **${commentsToPost.length} actionable inline suggestions**.\n\nPlease review my feedback and suggestions below. Happy coding! 🚀`;
    await octokit.rest.pulls.createReview({
      owner, repo, pull_number: pullNumber,
      commit_id: headSha, event: 'COMMENT', body, comments: commentsToPost
    });
  } else if (!aiEngineQueried) {
    console.error('❌ AI Engine was unreachable — posting COMMENT review instead of auto-approving.');
    await octokit.rest.pulls.createReview({
      owner, repo, pull_number: pullNumber, commit_id: headSha, event: 'COMMENT',
      body: `## ⚠️ RepoSage AI Code Review — AI Engine Unavailable\n\nThe AI engine could not be reached during this review. The secrets scanner found **0 issues**, but the PR was **not** fully reviewed by the AI.\n\nPlease ensure the AI Engine service is running and re-trigger the review for a complete analysis.`
    });
  } else {
    console.log('🎉 No code issues or recommendations found. Posting approval review...');
    await octokit.rest.pulls.createReview({
      owner, repo, pull_number: pullNumber, commit_id: headSha, event: 'APPROVE',
      body: `## 🛡️ RepoSage AI Code Review Audit Completed!\n\n🎉 Outstanding work! I have scanned the PR and found **0 issues**. Your changes look pristine, clean, and optimized! Approved! 🚀`
    });

    try {
      await octokit.rest.issues.addLabels({
        owner, repo, issue_number: pullNumber, labels: ['gssoc:approved']
      });
      console.log('✅ Added gssoc:approved label to PR');
    } catch (err) {
      console.warn('⚠️ Could not add gssoc:approved label:', err.message);
    }
  }
}

const router = Router();

router.post('/api/webhook', webhookLimiter, async (req, res) => {
  const webhookSecret = process.env.WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('❌ WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook secret not configured. Set WEBHOOK_SECRET in environment.' });
  }

  const signature = req.headers['x-hub-signature-256'];
  if (!signature) {
    return res.status(401).json({ error: 'Missing X-Hub-Signature-256 header.' });
  }

  if (!verifyWebhookSignature(req.rawBody, signature, webhookSecret)) {
    console.warn('❌ Webhook signature verification failed');
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  const event = req.headers['x-github-event'];
  const payload = req.body;

  if (!event || typeof event !== 'string') {
    return res.status(400).json({ error: 'Missing x-github-event header.' });
  }
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Invalid webhook payload.' });
  }
  if (event !== 'pull_request' && event !== 'push' && event !== 'ping') {
    return res.status(400).json({ error: `Unsupported webhook event: ${event}` });
  }

  if (event === 'push') {
    const owner = payload.repository?.owner?.login;
    const repo = payload.repository?.name;
    if (owner && repo) {
      const repoUrl = `https://github.com/${owner}/${repo}`;
      const removed = analysisCache.invalidateByRepoUrl(repoUrl);
      if (removed > 0) {
        console.log(`📡 Push event invalidated ${removed} cache entries for ${repoUrl}`);
      }
    }
  }

  if (event === 'pull_request') {
    const deliveryId = req.headers['x-github-delivery'];
    if (!deliveryId || typeof deliveryId !== 'string') {
      return res.status(400).json({ error: 'Missing x-github-delivery header.' });
    }
    const deliveryDedupKey = `webhook:delivery:${deliveryId}`;
    const isDuplicate = await redisClient.setnx(deliveryDedupKey, Date.now().toString());
    if (isDuplicate === 0) {
      console.log(`⏭️ Skipping duplicate webhook delivery: ${deliveryId}`);
      return res.json({ success: true, message: 'Webhook received (duplicate skipped).' });
    }
    await redisClient.expire(deliveryDedupKey, DELIVERY_REDIS_TTL);

    const action = payload.action;
    if (action === 'opened' || action === 'synchronize') {
      const pullNumber = payload.pull_request.number;
      const headSha = payload.pull_request.head.sha;
      const owner = payload.repository.owner.login;
      const repo = payload.repository.name;
      const reviewKey = `${owner}/${repo}/#${pullNumber}`;
      const shaKey = `${owner}/${repo}/#${pullNumber}`;
      const shaDedupKey = `webhook:sha:${shaKey}`;
      const shaAlreadyReviewed = await redisClient.sismember(shaDedupKey, headSha);
      if (shaAlreadyReviewed) {
        console.log(`⏭️ Already reviewed commit ${headSha.substring(0,7)} for PR #${pullNumber}`);
        return res.json({ success: true, message: 'Webhook received (duplicate SHA skipped).' });
      }

      console.log(`📡 GitHub Webhook received: PR #${pullNumber} ${action} (${headSha.substring(0,7)}) in ${owner}/${repo}`);

      if (reviewQueue._queues.size >= reviewQueue._maxQueues) {
        return res.status(429).json({ error: 'Too many pending reviews. Try again later.' });
      }

      const repoKey = `${owner}/${repo}`;
      const now = Date.now();
      const repoEntry = repoRequestCounts.get(repoKey) || { count: 0, windowStart: now };
      if (now - repoEntry.windowStart > REPO_WINDOW_MS) {
        repoEntry.count = 0;
        repoEntry.windowStart = now;
      }
      if (repoEntry.count >= REPO_MAX_REQUESTS) {
        console.warn(`⚠️ Rate limit exceeded for repository ${repoKey}`);
        return res.status(429).json({ error: 'Too many requests for this repository. Try again later.' });
      }
      repoEntry.count++;
      repoRequestCounts.set(repoKey, repoEntry);

      const enqueuePromise = reviewQueue.enqueue(reviewKey, { owner, repo, pullNumber, headSha }, async (item) => {
        try {
          await runWebhookReview(item.owner, item.repo, item.pullNumber, item.headSha);
        } catch (error) {
          console.error(`❌ Webhook review failed for ${headSha}:`, error.message);
          await redisClient.srem(shaDedupKey, headSha);
        }
      });
      if (enqueuePromise) {
        await redisClient.sadd(shaDedupKey, headSha);
        await redisClient.expire(shaDedupKey, DELIVERY_REDIS_TTL);
      } else {
        return res.status(429).json({ error: 'Review queue full. Try again later.' });
      }
    }
  }

  return res.json({ success: true, message: 'Webhook received.' });
});

export default router;
