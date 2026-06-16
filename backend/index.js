import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Octokit } from '@octokit/rest';
import PDFDocument from 'pdfkit';
import { requireApiKey } from './utils/authMiddleware.js';
import rateLimit from 'express-rate-limit';
import { scanSecrets, scanSecretsInChanges } from './utils/secretsScanner.js';
import { loadIgnorePatterns, readFilesRecursively } from './utils/ignoreHelper.js';
import { isValidRepoUrl, parseRepoUrl } from './utils/urlValidator.js';
import simpleGit from 'simple-git';
import escapeHtml from 'lodash.escape';
import { parseDiff } from './utils/diffParser.js';
import { analyzeComplexity } from './utils/complexityAnalyzer.js';
import { deleteFolderRecursive, getFolderSize } from './utils/fileHelper.js';
import { verifyWebhookSignature } from './utils/signatureVerifier.js';
import { mockAIReview } from './utils/mockAIReview.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS with explicit origin
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173').split(',');
app.use(cors({
  origin: ALLOWED_ORIGINS,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  credentials: true
}));

// Per-IP rate limiting for expensive endpoints
const analyzeLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many analyze requests. Please slow down and retry after 5 minutes.' }
});
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many chat requests. Please slow down and retry after 1 minute.' }
});

// Capture raw body for webhook signature verification before JSON parsing
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));

// Ensure temp_repos folder exists
const tempReposDir = path.join(__dirname, 'temp_repos');
if (!fs.existsSync(tempReposDir)) {
  fs.mkdirSync(tempReposDir, { recursive: true });
}

// Clean up temp_repos on process exit to avoid leftover clones
function cleanupTempRepos() {
  if (fs.existsSync(tempReposDir)) {
    fs.rmSync(tempReposDir, { recursive: true, force: true });
  }
}
process.on('SIGINT', () => { cleanupTempRepos(); process.exit(0); });
process.on('SIGTERM', () => { cleanupTempRepos(); process.exit(0); });
process.on('exit', cleanupTempRepos);

// Session-isolated repository contexts for chat functionality (issue #59)
const repoContexts = new Map();
const CONTEXT_TTL = 30 * 60 * 1000; // 30 minutes

// Periodic cleanup of stale contexts
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, entry] of repoContexts) {
    if (now - entry.timestamp > CONTEXT_TTL) {
      repoContexts.delete(sessionId);
    }
  }
}, 60 * 1000);

// Webhook deduplication state (module scope to persist across requests)
const activeReviews = new Set();
const processedDeliveries = new Map();
const DELIVERY_TTL = 60 * 60 * 1000; // 1 hour

// Periodic cleanup of expired delivery entries (TTL-based eviction)
const dedupCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [deliveryId, timestamp] of processedDeliveries) {
    if (now - timestamp > DELIVERY_TTL) {
      processedDeliveries.delete(deliveryId);
    }
  }
}, 60 * 1000);

// Clean up timers on server shutdown
process.on('SIGTERM', () => {
  clearInterval(dedupCleanupTimer);
});
process.on('SIGINT', () => {
  clearInterval(dedupCleanupTimer);
});

// 🟢 Route: GitHub Import & AI Review
app.post('/api/analyze', requireApiKey, analyzeLimiter, async (req, res) => {
  const { repoUrl, company = 'General', language = 'English', model = 'llama-3.3-70b-versatile',temperature = 0.7,
     maxTokens = 2048, systemPrompt = '', batchSize = 5
   } = req.body;

  if (!repoUrl) {
    return res.status(400).json({ error: 'GitHub Repository URL is required.' });
  }

  if (!isValidRepoUrl(repoUrl)) {
    return res.status(400).json({ error: 'Invalid GitHub repository URL. Only https://github.com/owner/repo URLs are allowed.' });
  }

  // Sanitize systemPrompt: limit length and strip dangerous directives
  const sanitizePrompt = (prompt) => {
    if (!prompt) return '';
    const safe = String(prompt).slice(0, 2000);
    const dangerous = ['ignore all', 'ignore previous', 'ignore above', 'forget all', 'forget previous', 'you are not', 'override all', 'disregard'];
    let result = safe;
    for (const phrase of dangerous) {
      const idx = result.toLowerCase().indexOf(phrase);
      if (idx !== -1) {
        result = result.slice(0, idx) + result.slice(idx + phrase.length);
      }
    }
    return result;
  };
  const validatedPrompt = sanitizePrompt(systemPrompt);

  // Generate unique folder name
  const parsed = parseRepoUrl(repoUrl);
  const repoName = parsed.repo;
  const uniqueId = crypto.randomUUID();
  const clonePath = path.join(tempReposDir, `${repoName}_${uniqueId}`);

  console.log(`🚀 Cloning: ${repoUrl} into ${clonePath}`);

  // Clone repo using simple-git to prevent shell injection and handle timeouts
  try {
    const cloneTimeout = parseInt(process.env.GIT_CLONE_TIMEOUT) || 120000;
    const git = simpleGit({ timeout: { block: cloneTimeout } });
    await git.clone(repoUrl, clonePath, ['--depth', '1']);

    // Check repository size
    const maxRepoSizeMB = parseInt(process.env.MAX_REPO_SIZE_MB) || 100;
    const maxSizeBytes = maxRepoSizeMB * 1024 * 1024;
    const repoSize = getFolderSize(clonePath);
    
    if (repoSize > maxSizeBytes) {
      deleteFolderRecursive(clonePath);
      return res.status(413).json({ error: `Repository exceeds the maximum allowed size of ${maxRepoSizeMB}MB.` });
    }
  } catch (error) {
    console.error(`❌ Git Clone Error: ${error.message}`);
    deleteFolderRecursive(clonePath);
    return res.status(500).json({ error: 'Failed to clone repository. Make sure the URL is public and within size limits.' });
  }

    try {
      // 1. Load ignore patterns and read files
      const ignorePatterns = loadIgnorePatterns(clonePath);
      const files = readFilesRecursively(clonePath, [], clonePath, ignorePatterns);
      
      if (files.length === 0) {
        deleteFolderRecursive(clonePath);
        return res.status(400).json({ error: 'No supportable source code files found in the repository.' });
      }

      console.log(`📁 Found ${files.length} valid source files. Sending to AI engine...`);

      // 2. Mocking AI Response for initial setup (or forward to FastAPI AI Engine)
      // This is a perfect placeholder where contributors can connect the FastAPI server!
      const aiEngineUrl = process.env.AI_ENGINE_URL || 'http://localhost:8000';
      
      let reviewResult;
      try {
        const aiResponse = await fetch(`${aiEngineUrl}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files, company, language, model, temperature, maxTokens, systemPrompt: validatedPrompt, batchSize })
        });
        
        if (aiResponse.ok) {
          reviewResult = await aiResponse.json();
          reviewResult._mock = false;
        } else {
          throw new Error('AI engine responded with error');
        }
      } catch (err) {
        console.warn('⚠️ FastAPI engine not running, falling back to local Express review handler');
        // Let's generate a smart mockup review based on files so it works as an autonomous MVP
        reviewResult = mockAIReview(files, model);
      }

      // 3. Inject Regex-based Secret Detections & Complexity Metrics into the analysis result
      if (reviewResult && reviewResult.fileReviews) {
        reviewResult.metrics = {};
        
        files.forEach(file => {
          // Calculate complexity metrics
          reviewResult.metrics[file.name] = analyzeComplexity(file.content, file.name);

          const secretFindings = scanSecrets(file.content);
          if (secretFindings.length > 0) {
            // Make sure the file exists in reviews
            if (!reviewResult.fileReviews[file.name]) {
              reviewResult.fileReviews[file.name] = { bugs: [], security: [], optimization: [], styling: [] };
            }
            // Append found secrets to security category
            if (!reviewResult.fileReviews[file.name].security) {
              reviewResult.fileReviews[file.name].security = [];
            }
            // Avoid duplicate additions
            secretFindings.forEach(finding => {
              const duplicate = reviewResult.fileReviews[file.name].security.some(s => s.line === finding.line && s.type === finding.type);
              if (!duplicate) {
                reviewResult.fileReviews[file.name].security.unshift(finding); // Place at top of security findings
              }
            });
          }
        });
      }

      // 3. Cache the repository context for chat with session isolation
      const sessionId = crypto.randomUUID();
      repoContexts.set(sessionId, {
        repoUrl,
        repoName,
        files,
        timestamp: Date.now()
      });

      // 4. Clean up folder
      deleteFolderRecursive(clonePath);
      
      // 5. Return result
      return res.json({
        success: true,
        repoName,
        filesReviewedCount: files.length,
        analysis: reviewResult,
        sessionId
      });

    } catch (err) {
      console.error(err);
      deleteFolderRecursive(clonePath);
      return res.status(500).json({ error: 'An error occurred during repository analysis.' });
    }
});

// 🟢 Route: AI Chat with Repository (session-isolated per issue #59)
app.post('/api/chat', requireApiKey, chatLimiter, async (req, res) => {
  const { message, history = [], model = 'llama-3.3-70b-versatile', temperature = 0.7, maxTokens = 2048, systemPrompt = 'You are a helpful code reviewer.', sessionId } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  const context = sessionId ? repoContexts.get(sessionId) : null;
  if (!context) {
    const hint = !sessionId ? 'sessionId is missing from the request' : 'session expired';
    return res.status(400).json({ error: `No repository is currently active or ${hint}. Please analyze a repository first.` });
  }

  // Refresh TTL on access
  context.timestamp = Date.now();

  const aiEngineUrl = process.env.AI_ENGINE_URL || 'http://localhost:8000';

  try {
    const aiResponse = await fetch(`${aiEngineUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        files: context.files,
        message,
        history,
        model,
        temperature,
        maxTokens,
        systemPrompt
      })
    });

    if (aiResponse.ok) {
      const data = await aiResponse.json();
      return res.json(data);
    } else {
      const errText = await aiResponse.text();
      throw new Error(errText || 'AI engine chat request failed');
    }
  } catch (err) {
    console.error('❌ Chat API Error:', err.message);
    
    // Simple local fallback if Python FastAPI server is offline
    const responseMessage = `[Fallback Response] I see you are asking about: "${message}". Currently, the FastAPI AI Engine is offline, so I cannot analyze the full codebase for your query. Please make sure the AI Engine service is running on port 8000.`;
    return res.json({ response: responseMessage, sessionId, _mock: true, _mockWarning: 'AI Engine unavailable. Fallback response generated.' });
  }
});



// 🟢 Route: GitHub Webhook Receiver for automated Pull Request Reviews
app.post('/api/webhook', async (req, res) => {
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

  if (event === 'pull_request') {
    // Deduplicate by X-GitHub-Delivery header
    const deliveryId = req.headers['x-github-delivery'];
    if (deliveryId) {
      if (processedDeliveries.has(deliveryId)) {
        console.log(`⏭️ Skipping duplicate webhook delivery: ${deliveryId}`);
        return res.json({ success: true, message: 'Webhook received (duplicate skipped).' });
      }
      processedDeliveries.set(deliveryId, Date.now());
    }

    const action = payload.action;
    if (action === 'opened' || action === 'synchronize') {
      const pullNumber = payload.pull_request.number;
      const owner = payload.repository.owner.login;
      const repo = payload.repository.name;
      const reviewKey = `${owner}/${repo}/#${pullNumber}`;
      
      console.log(`📡 GitHub Webhook received: PR #${pullNumber} ${action} in ${owner}/${repo}`);
      
      // Skip if a review is already in progress for this PR
      if (activeReviews.has(reviewKey)) {
        console.log(`⏭️ Review already in progress for ${reviewKey}, skipping.`);
        return res.json({ success: true, message: 'Webhook received (review in progress).' });
      }
      
      activeReviews.add(reviewKey);
      
      // Execute code review asynchronously to prevent GitHub webhook timeout (10s)
      runWebhookReview(owner, repo, pullNumber).catch(err => {
        console.error(`❌ Async PR Review Error:`, err);
      }).finally(() => {
        activeReviews.delete(reviewKey);
      });
    }
  }

  return res.json({ success: true, message: 'Webhook received.' });
});

// 🟢 Route: Create GitHub Issue automatically for Code Reviews
app.post('/api/issues/create', requireApiKey, async (req, res) => {
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

  try {
    let parsedUrl;
    try {
      parsedUrl = new URL(repoUrl);
    } catch {
      return res.status(400).json({ error: 'Invalid GitHub repository URL.' });
    }
    if (parsedUrl.hostname !== 'github.com') {
      return res.status(400).json({ error: 'URL must be a github.com repository.' });
    }
    const pathParts = parsedUrl.pathname.replace(/\.git$/, '').replace(/\/$/, '').split('/').filter(Boolean);
    if (pathParts.length < 2) {
      return res.status(400).json({ error: 'Invalid GitHub repository URL structure.' });
    }
    const [owner, repo] = pathParts;

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

// 🟢 Helper to execute Webhook PR review logic
async function runWebhookReview(owner, repo, pullNumber) {
  const token = process.env.GITHUB_PAT;
  if (!token) {
    console.warn("⚠️ GITHUB_PAT not set in backend/.env. Cannot run webhook PR review.");
    return;
  }

  const octokit = new Octokit({ auth: token });
  console.log(`🔍 Fetching diff for PR #${pullNumber}...`);

  // 1. Fetch Diff from GitHub
  const { data: diff } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
    mediaType: {
      format: 'diff'
    }
  });

  if (!diff) {
    console.warn("⚠️ No diff found for this PR.");
    return;
  }

  // 2. Parse files and changes
  const parsedFiles = parseDiff(diff);
  console.log(`📁 Found ${parsedFiles.length} files in PR diff.`);

  const commentsToPost = [];
  const filesToReview = [];

  for (const file of parsedFiles) {
    // Check if file is supported
    const ext = file.path.split('.').pop()?.toLowerCase();
    const validExtensions = ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'go', 'rs', 'cpp', 'h', 'cs', 'css', 'html', 'php', 'rb', 'sql'];
    if (!ext || !validExtensions.includes(ext) || file.changes.length === 0) {
      continue;
    }

    // Run local secrets scanner
    const secretFindings = scanSecretsInChanges(file.changes);
    secretFindings.forEach(f => {
      commentsToPost.push({
        path: file.path,
        line: f.line,
        body: `<!-- RepoSage Review Comment -->\n${f.comment}`
      });
    });

    // Save list to send to FastAPI AI Engine
    filesToReview.push({
      path: file.path,
      changes: file.changes.map(c => ({ line: c.line, content: c.content }))
    });
  }

  if (filesToReview.length > 0) {
    console.log(`🧠 Querying AI engine for ${filesToReview.length} files...`);
    const aiEngineUrl = process.env.AI_ENGINE_URL || 'http://localhost:8000';
    
    try {
      const aiResponse = await fetch(`${aiEngineUrl}/review-diff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: filesToReview })
      });

      if (aiResponse.ok) {
        const result = await aiResponse.json();
        if (result.comments && Array.isArray(result.comments)) {
          result.comments.forEach(c => {
            // Avoid duplicate comments if secrets scanner already flagged it
            const duplicate = commentsToPost.some(exist => exist.path === c.path && exist.line === c.line);
            if (!duplicate) {
              commentsToPost.push(c);
            }
          });
        }
      }
    } catch (err) {
      console.warn("⚠️ FastAPI AI Engine error, posting local scans only:", err.message);
    }
  }

  // 3. Post consolidated review comment back to GitHub PR
  if (commentsToPost.length > 0) {
    console.log(`✍️ Posting PR Review with ${commentsToPost.length} inline comments...`);
    await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      event: 'COMMENT',
      body: `## 🛡️ RepoSage AI Code Review Audit Completed!

I have audited the code changes in this Pull Request and generated **${commentsToPost.length} actionable inline suggestions**. 

Please review my feedback and suggestions below. Happy coding! 🚀`,
      comments: commentsToPost
    });
  } else {
    console.log('🎉 No code issues or recommendations found. Posting approval review...');
    await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      event: 'APPROVE',
      body: `## 🛡️ RepoSage AI Code Review Audit Completed!

🎉 Outstanding work! I have scanned the PR and found **0 issues**. Your changes look pristine, clean, and optimized! Approved! 🚀`
    });

    try {
      await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: pullNumber,
        labels: ['gssoc:approved']
      });
      console.log('✅ Added gssoc:approved label to PR');
    } catch (err) {
      console.warn('⚠️ Could not add gssoc:approved label:', err.message);
    }
  }
}



// 🟢 Route: Export Review Report to HTML
app.post('/api/reports/html', requireApiKey, (req, res) => {
  const { repoName, analysis } = req.body;
  if (!repoName || !analysis) {
    return res.status(400).json({ error: 'Repository name and analysis result are required.' });
  }

  let fileRows = '';
  
  if (analysis && analysis.fileReviews) {
    Object.keys(analysis.fileReviews).forEach(file => {
      const review = analysis.fileReviews[file];
      const allFindings = [
        ...(review.bugs || []).map(f => ({ ...f, category: 'Bug' })),
        ...(review.security || []).map(f => ({ ...f, category: 'Security' })),
        ...(review.optimization || []).map(f => ({ ...f, category: 'Optimization' })),
        ...(review.styling || []).map(f => ({ ...f, category: 'Styling' }))
      ];
      
      allFindings.forEach(f => {
        fileRows += `
          <tr>
            <td><strong>${escapeHtml(file)}</strong></td>
            <td><span class="badge badge-${escapeHtml(f.category).toLowerCase()}">${escapeHtml(f.category)}</span></td>
            <td>${escapeHtml(String(f.line))}</td>
            <td><strong>${escapeHtml(f.type)}</strong></td>
            <td>${escapeHtml(f.description)}</td>
            <td><code class="code-font">${escapeHtml(f.suggestion)}</code></td>
          </tr>
        `;
      });
    });
  }

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>RepoSage Code Audit - ${escapeHtml(repoName)}</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: #0f172a;
          color: #f1f5f9;
          margin: 0;
          padding: 40px;
        }
        .container {
          max-width: 1200px;
          margin: 0 auto;
          background: #1e293b;
          border-radius: 12px;
          padding: 30px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          border: 1px solid rgba(255,255,255,0.05);
        }
        h1 {
          font-size: 28px;
          margin-top: 0;
          color: #a855f7;
          border-bottom: 2px solid rgba(168,85,247,0.2);
          padding-bottom: 15px;
        }
        .meta {
          font-size: 14px;
          color: #94a3b8;
          margin-bottom: 25px;
          line-height: 1.6;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
        th, td {
          padding: 12px 15px;
          text-align: left;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          font-size: 13px;
        }
        th {
          background-color: rgba(255,255,255,0.03);
          color: #e2e8f0;
          font-weight: 600;
        }
        tr:hover {
          background-color: rgba(255,255,255,0.04);
        }
        tr:nth-child(even) {
          background-color: rgba(255,255,255,0.015);
        }
        .badge {
          display: inline-block;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
        }
        .badge-bug { background: #ef4444; color: white; }
        .badge-security { background: #f59e0b; color: #0f172a; }
        .badge-optimization { background: #3b82f6; color: white; }
        .badge-styling { background: #10b981; color: white; }
        .code-font {
          font-family: monospace;
          background: rgba(0,0,0,0.2);
          padding: 4px 8px;
          border-radius: 4px;
          color: #c084fc;
          font-size: 12px;
          white-space: pre-wrap;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🛡️ RepoSage AI Code Audit Report</h1>
        <div class="meta">
          <strong>Repository Name:</strong> ${escapeHtml(repoName)}<br>
          <strong>Report Timestamp:</strong> ${new Date().toLocaleString()}<br>
          <strong>Audited with:</strong> RepoSage GSSoC '26 Audit Engine
        </div>
        <table>
          <thead>
            <tr>
              <th>File Path</th>
              <th>Category</th>
              <th>Line</th>
              <th>Finding Type</th>
              <th>Description</th>
              <th>Actionable Suggestion</th>
            </tr>
          </thead>
          <tbody>
            ${fileRows || '<tr><td colspan="6" style="text-align:center;">🎉 No issues found! Your codebase is clean.</td></tr>'}
          </tbody>
        </table>
        <div style="margin-top: 30px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 15px;">
          RepoSage AI © 2026. Made with 💜 for GirlScript Summer of Code (GSSoC).
        </div>
      </div>
    </body>
    </html>
  `;
  
  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Content-Disposition', `attachment; filename="${repoName}_AUDIT_REPORT.html"`);
  return res.send(html);
});

// 🟢 Route: Export Review Report to PDF
app.post('/api/reports/pdf', requireApiKey, (req, res) => {
  const { repoName, analysis } = req.body;
  if (!repoName || !analysis) {
    return res.status(400).json({ error: 'Repository name and analysis result are required.' });
  }

  const fileReviews = analysis.fileReviews || {};
  const metrics = analysis.metrics || {};
  const categories = [
    { key: 'bugs', label: 'Bug', badge: 'BUG', color: '#dc2626' },
    { key: 'security', label: 'Security', badge: 'SECURITY', color: '#d97706' },
    { key: 'optimization', label: 'Optimization', badge: 'PERF', color: '#2563eb' },
    { key: 'styling', label: 'Styling', badge: 'STYLE', color: '#059669' }
  ];

  const findingsByFile = Object.entries(fileReviews).map(([file, review]) => {
    const findings = categories.flatMap(category => (
      (review[category.key] || []).map(finding => ({ ...finding, category }))
    ));
    return { file, findings };
  });

  const summary = categories.reduce((acc, category) => {
    acc[category.key] = findingsByFile.reduce((total, { findings }) => (
      total + findings.filter(finding => finding.category.key === category.key).length
    ), 0);
    return acc;
  }, {});
  const totalFindings = Object.values(summary).reduce((total, count) => total + count, 0);
  const safeRepoName = String(repoName).replace(/[^\w.-]+/g, '_');

  const doc = new PDFDocument({ margin: 48, size: 'A4' });
  const chunks = [];

  doc.on('data', chunk => chunks.push(chunk));
  doc.on('end', () => {
    const pdf = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeRepoName}_AUDIT_REPORT.pdf"`);
    res.setHeader('Content-Length', pdf.length);
    res.send(pdf);
  });
  doc.on('error', error => {
    console.error('PDF report generation failed:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate PDF report.' });
    }
  });

  const ensureSpace = (needed = 72) => {
    if (doc.y + needed > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
    }
  };

  const normalizeText = value => String(value ?? 'N/A').replace(/\s+/g, ' ').trim();

  const addSectionTitle = title => {
    ensureSpace(48);
    doc.moveDown(0.8);
    doc.font('Helvetica-Bold').fontSize(15).fillColor('#111827').text(title);
    doc.moveTo(48, doc.y + 4).lineTo(547, doc.y + 4).strokeColor('#e5e7eb').stroke();
    doc.moveDown(0.8);
  };

  const addBadge = (label, color) => {
    const x = doc.x;
    const y = doc.y + 1;
    const width = doc.widthOfString(label) + 12;
    doc.save().roundedRect(x, y, width, 16, 4).fill(color).restore();
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff').text(label, x + 6, y + 4, { lineBreak: false });
    doc.x = x + width + 8;
    doc.y = y;
  };

  doc.font('Helvetica-Bold').fontSize(24).fillColor('#111827').text('RepoSage AI Code Audit Report');
  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(10).fillColor('#4b5563')
    .text(`Repository: ${repoName}`)
    .text(`Report Timestamp: ${new Date().toLocaleString()}`)
    .text("Audited with: RepoSage GSSoC '26 Audit Engine");

  addSectionTitle('Summary');
  doc.font('Helvetica').fontSize(11).fillColor('#111827')
    .text(`Files scanned: ${Object.keys(fileReviews).length}`)
    .text(`Total findings: ${totalFindings}`)
    .text(`Bugs: ${summary.bugs}   Security: ${summary.security}   Performance: ${summary.optimization}   Styling: ${summary.styling}`);

  addSectionTitle('File Findings');
  if (totalFindings === 0) {
    doc.font('Helvetica').fontSize(11).fillColor('#059669').text('No issues found. Your codebase is clean.');
  } else {
    findingsByFile.forEach(({ file, findings }) => {
      if (findings.length === 0) return;
      ensureSpace(92);
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text(file);
      doc.moveDown(0.35);

      findings.forEach(finding => {
        ensureSpace(112);
        addBadge(finding.category.badge, finding.category.color);
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827')
          .text(`${normalizeText(finding.type)} - Line ${normalizeText(finding.line)}`, doc.x, doc.y, { width: 380 });
        doc.moveDown(0.25);
        doc.font('Helvetica').fontSize(9).fillColor('#374151')
          .text(`Description: ${normalizeText(finding.description)}`, { width: 490 });
        doc.font('Helvetica').fontSize(9).fillColor('#4b5563')
          .text(`Suggestion: ${normalizeText(finding.suggestion)}`, { width: 490 });
        doc.moveDown(0.6);
      });
    });
  }

  const metricEntries = Object.entries(metrics);
  if (metricEntries.length > 0) {
    addSectionTitle('Code Metrics');
    metricEntries.forEach(([file, fileMetrics]) => {
      ensureSpace(42);
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(file);
      doc.font('Helvetica').fontSize(9).fillColor('#4b5563')
        .text(`Total: ${fileMetrics.totalLines ?? 0}   Code: ${fileMetrics.codeLines ?? 0}   Comments: ${fileMetrics.commentLines ?? 0}   Empty: ${fileMetrics.emptyLines ?? 0}`);
      doc.moveDown(0.45);
    });
  }

  doc.end();
});

app.listen(PORT, () => {
  console.log(`🟢 RepoSage Backend running on http://localhost:${PORT}`);
});
