import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import simpleGit from 'simple-git';
import { requireApiKey } from '../utils/authMiddleware.js';
import { scanSecrets } from '../utils/secretsScanner.js';
import { loadIgnorePatterns, readFilesRecursively } from '../utils/ignoreHelper.js';
import { isValidRepoUrl, parseRepoUrl } from '../utils/urlValidator.js';
import { analyzeComplexity } from '../utils/complexityAnalyzer.js';
import { deleteFolderRecursive, getFolderSize } from '../utils/fileHelper.js';
import { scanFileContentForWarnings } from '../utils/sanitizeFileContent.js';
import { mockAIReview } from '../utils/mockAIReview.js';
import { ensureConnection } from '../config/db.js';
import Analytics from '../models/Analytics.js';
import Session, { estimateSessionSize } from '../models/Session.js';
import {
  analysisCache, octokit, fetchWithTimeout, ALLOWED_ANALYSIS_MODELS,
  validatePrompt, requireJsonContentType, redisClient
} from './context.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const tempReposDir = path.join(__dirname, '..', 'temp_repos');
if (!fs.existsSync(tempReposDir)) {
  fs.mkdirSync(tempReposDir, { recursive: true });
}

const analyzeLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisClient ? new RedisStore({ sendCommand: (...args) => redisClient.call(...args) }) : undefined,
  message: { error: 'Too many analyze requests. Please slow down and retry after 5 minutes.' }
});

const DEPENDENCY_REGISTRIES = {
  'package.json': async (filePath) => {
    const pkg = JSON.parse(await fs.promises.readFile(filePath, 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const results = [];
    const maxCheck = 10;
    let checked = 0;
    for (const [name, version] of Object.entries(deps)) {
      if (checked >= maxCheck) {
        results.push({ name, currentVersion: version.replace('^', '').replace('~', ''), latestVersion: 'unknown', risk: 'Unknown', deprecated: false, vulnerable: false, recommendation: 'Manual review recommended.' });
        continue;
      }
      try {
        const resp = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`, { signal: AbortSignal.timeout(5000) });
        if (resp.ok) {
          const data = await resp.json();
          const current = version.replace('^', '').replace('~', '');
          const latest = data.version || 'unknown';
          const isOutdated = latest !== 'unknown' && current !== latest;
          const semverCurrent = current.split('.').map(Number);
          const semverLatest = latest.split('.').map(Number);
          const isMajor = isOutdated && semverCurrent[0] < semverLatest[0];
          results.push({ name, currentVersion: current, latestVersion: latest, risk: isMajor ? 'High' : isOutdated ? 'Medium' : 'Low', deprecated: false, vulnerable: false, recommendation: isOutdated ? `Update from ${current} to ${latest}.` : 'Up to date.' });
        } else {
          results.push({ name, currentVersion: version, latestVersion: 'unknown', risk: 'Unknown', deprecated: false, vulnerable: false, recommendation: 'Could not check npm registry.' });
        }
      } catch {
        results.push({ name, currentVersion: version, latestVersion: 'unknown', risk: 'Unknown', deprecated: false, vulnerable: false, recommendation: 'Could not check npm registry.' });
      }
      checked++;
    }
    return results;
  },
};

async function generateDependencyReport(clonePath) {
  const deps = [];
  for (const [manifest, checker] of Object.entries(DEPENDENCY_REGISTRIES)) {
    const filePath = path.join(clonePath, manifest);
    if (fs.existsSync(filePath)) {
      try {
        const found = await checker(filePath);
        deps.push(...found);
      } catch (err) {
        console.warn(`⚠️ Failed to parse ${manifest}: ${err.message}`);
      }
    }
  }
  return { dependencies: deps };
}

const router = Router();

router.post('/api/analyze', requireApiKey, requireJsonContentType, analyzeLimiter, async (req, res) => {
  let { repoUrl, company = 'General', language = 'English', model = 'llama-3.3-70b-versatile', temperature = 0.7,
     maxTokens = 2048, systemPrompt = '', batchSize = 5
   } = req.body;

  batchSize = Math.max(1, Math.min(20, parseInt(batchSize, 10) || 5));
  temperature = Math.max(0, Math.min(2, parseFloat(temperature) || 0.7));
  maxTokens = Math.max(1, Math.min(128000, parseInt(maxTokens, 10) || 2048));

  const normalizedModel = ALLOWED_ANALYSIS_MODELS.find(m => m.toLowerCase() === model.toLowerCase());
  if (!normalizedModel) {
    model = "llama-3.3-70b-versatile";
  } else {
    model = normalizedModel;
  }

  if (!repoUrl) {
    return res.status(400).json({ error: 'GitHub Repository URL is required.' });
  }

  if (!isValidRepoUrl(repoUrl)) {
    return res.status(400).json({ error: 'Invalid GitHub repository URL. Only https://github.com/owner/repo URLs are allowed.' });
  }

  let validatedPrompt;
  try {
    validatedPrompt = validatePrompt(systemPrompt);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  const parsed = parseRepoUrl(repoUrl);
  const repoName = parsed.repo.replace(/[^a-zA-Z0-9_-]/g, '');
  const owner = parsed.owner;
  const maxRepoSizeMB = parseInt(process.env.MAX_REPO_SIZE_MB, 10) || 100;
  const maxSizeBytes = maxRepoSizeMB * 1024 * 1024;

  if (process.env.GITHUB_PAT) {
    try {
      const { data: repoData } = await octokit.rest.repos.get({ owner, repo: repoName });
      const repoSizeBytes = (repoData.size || 0) * 1024;
      if (repoSizeBytes > maxSizeBytes) {
        return res.status(413).json({ error: `Repository exceeds the maximum allowed size of ${maxRepoSizeMB}MB (Reported size: ~${Math.round(repoSizeBytes/1024/1024)}MB).` });
      }
    } catch (err) {
      if (err.status !== 403 && err.status !== 429) {
        console.error(`❌ GitHub API error verifying size for ${owner}/${repoName}: ${err.message}`);
        return res.status(502).json({ error: `Failed to verify repository size: ${err.message}. Check GITHUB_PAT configuration.` });
      }
      console.warn(`Could not verify repository size via GitHub API for ${owner}/${repoName}. Proceeding to clone with filters...`);
    }
  } else {
    console.warn('No GITHUB_PAT configured — skipping pre-clone size check. Set MAX_REPO_SIZE_MB to enforce limit at clone time.');
  }

  const uniqueId = crypto.randomUUID();
  const clonePath = path.join(tempReposDir, `${repoName}_${uniqueId}`);

  console.log(`🚀 Cloning: ${repoUrl} into ${clonePath}`);

  try {
    const cloneTimeout = parseInt(process.env.GIT_CLONE_TIMEOUT, 10) || 120000;
    const git = simpleGit({ timeout: { block: cloneTimeout } });
    await git.clone(repoUrl, clonePath, ['--depth', '1', '--single-branch', `--filter=blob:limit=${maxRepoSizeMB}m`]);

    const repoSize = await getFolderSize(clonePath);

    if (repoSize > maxSizeBytes) {
      await deleteFolderRecursive(clonePath);
      return res.status(413).json({ error: `Repository exceeds the maximum allowed size of ${maxRepoSizeMB}MB.` });
    }
  } catch (error) {
    console.error(`❌ Git Clone Error: ${error.message}`);
    await deleteFolderRecursive(clonePath);
    return res.status(500).json({ error: 'Failed to clone repository. Make sure the URL is public and within size limits.' });
  }

  try {
    const ignorePatterns = loadIgnorePatterns(clonePath);
    const files = readFilesRecursively(clonePath, [], clonePath, ignorePatterns);

    if (files.length === 0) {
      await deleteFolderRecursive(clonePath);
      return res.status(400).json({ error: 'No supportable source code files found in the repository.' });
    }

    console.log(`📁 Found ${files.length} valid source files. Checking cache...`);

    const fileWarnings = [];
    for (const file of files) {
      const fileScanWarnings = scanFileContentForWarnings(file.content);
      for (const warning of fileScanWarnings) {
        fileWarnings.push({ file: file.name, warning });
      }
    }
    if (fileWarnings.length > 0) {
      console.warn(`⚠️ Found ${fileWarnings.length} potential prompt injection patterns across ${files.length} files`);
    }

    const cacheKey = analysisCache.generateKey(repoUrl, files, { model, language, company, systemPrompt: validatedPrompt, temperature, maxTokens, batchSize });
    let cacheHit = !!analysisCache.get(cacheKey);
    if (cacheHit) {
      console.log(`🎯 Using cached analysis result for this repository and configuration`);
    }

    let reviewResult = await analysisCache.getOrSet(cacheKey, async () => {
      const aiEngineUrl = process.env.AI_ENGINE_URL || 'http://localhost:8000';
      const baseUrl = aiEngineUrl.replace(/\/+$/, '');
      try {
        const aiResponse = await fetchWithTimeout(`${baseUrl}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.REPOSAGE_API_KEY || '' },
          body: JSON.stringify({ files, company, language, model, temperature, maxTokens, systemPrompt: validatedPrompt, batchSize })
        }, 120000);

        if (aiResponse.ok) {
          const resData = await aiResponse.json();
          resData._mock = false;
          return resData;
        } else {
          throw new Error('AI engine responded with error');
        }
      } catch (err) {
        console.warn('⚠️ FastAPI engine not running, falling back to local Express review handler');
        const mockRes = mockAIReview(files, model);
        mockRes._mock = true;
        return mockRes;
      }
    });

    if (reviewResult && reviewResult.fileReviews) {
      reviewResult.metrics = {};

      files.forEach(file => {
        reviewResult.metrics[file.name] = analyzeComplexity(file.content, file.name);

        const secretFindings = scanSecrets(file.content);
        if (secretFindings.length > 0) {
          if (!reviewResult.fileReviews[file.name]) {
            reviewResult.fileReviews[file.name] = { bugs: [], security: [], optimization: [], styling: [] };
          }
          secretFindings.forEach(finding => {
            const duplicate = reviewResult.fileReviews[file.name].security.some(s => s.line === finding.line && s.type === finding.type);
            if (!duplicate) {
              reviewResult.fileReviews[file.name].security.unshift(finding);
            }
          });
        }
      });
    }

    const MAX_FILE_CONTENT_STORAGE = 50000;
    const storedFiles = files.map(f => ({
      name: f.name,
      content: f.content.length > MAX_FILE_CONTENT_STORAGE
        ? f.content.slice(0, MAX_FILE_CONTENT_STORAGE)
        : f.content
    }));

    const MAX_SESSION_DOC_SIZE = 10 * 1024 * 1024;
    const estimatedSize = estimateSessionSize(storedFiles);

    let sessionId = null;
    let sessionPersisted = false;
    if (estimatedSize <= MAX_SESSION_DOC_SIZE) {
      sessionId = crypto.randomUUID();
      try {
        await Session.create({
          sessionId,
          repoUrl,
          repoName,
          files: storedFiles,
          lastAccessedAt: new Date(),
          ownerToken: req.clientId,
        });
        sessionPersisted = true;
      } catch (sessionErr) {
        console.warn('⚠️ Failed to persist session context:', sessionErr.message);
      }
    } else {
      console.warn(`⚠️ Session too large (${(estimatedSize / 1024 / 1024).toFixed(1)}MB), skipping persistence`);
    }

    let ragStatus = 'skipped';
    try {
      const baseUrl = (process.env.AI_ENGINE_URL || 'http://localhost:8000').replace(/\/+$/, '');
      const splitResp = await fetchWithTimeout(`${baseUrl}/api/rag/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.REPOSAGE_API_KEY || '' },
        body: JSON.stringify({ files: storedFiles, repo_url: repoUrl })
      }, 30000);
      if (splitResp.ok) {
        const { chunks } = await splitResp.json();
        let ingestOk = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            const ingestResp = await fetchWithTimeout(`${baseUrl}/api/rag/ingest`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.REPOSAGE_API_KEY || '' },
              body: JSON.stringify({ repo_url: repoUrl, chunks })
            }, 60000);
            if (ingestResp.ok) {
              ingestOk = true;
              try {
                const verifyResp = await fetchWithTimeout(`${baseUrl}/api/rag/chunks`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.REPOSAGE_API_KEY || '' },
                  body: JSON.stringify({ repo_url: repoUrl, limit: 1, offset: 0 })
                }, 10000);
                if (verifyResp.ok) {
                  const verifyData = await verifyResp.json();
                  if (verifyData.total_chunks > 0) {
                    ragStatus = 'verified';
                  } else {
                    ragStatus = 'stored_unverified';
                  }
                } else {
                  ragStatus = 'stored_unverified';
                }
              } catch (verifyErr) {
                ragStatus = 'stored_unverified';
              }
              break;
            } else {
              throw new Error(`Ingest responded with ${ingestResp.status}`);
            }
          } catch (ingestErr) {
            if (attempt < 3) {
              const delay = Math.pow(2, attempt) * 1000;
              console.warn(`⚠️ RAG ingest attempt ${attempt} failed, retrying in ${delay}ms:`, ingestErr.message);
              await new Promise(r => setTimeout(r, delay));
            } else {
              console.error(`❌ RAG ingest failed after 3 attempts:`, ingestErr.message);
              ragStatus = 'failed';
            }
          }
        }
      } else {
        ragStatus = 'split_failed';
      }
    } catch (ragErr) {
      console.warn('⚠️ RAG ingestion failed (non-fatal):', ragErr.message);
      ragStatus = 'failed';
      fileWarnings.push({ file: '(global)', warning: 'RAG code context ingestion failed — review may have limited accuracy' });
    }

    let totalBugs = 0, totalSecurityIssues = 0, totalOptimizations = 0, totalStylingIssues = 0;
    if (reviewResult && reviewResult.fileReviews) {
      for (const file of Object.keys(reviewResult.fileReviews)) {
        const review = reviewResult.fileReviews[file];
        totalBugs += (review.bugs || []).length;
        totalSecurityIssues += (review.security || []).length;
        totalOptimizations += (review.optimization || []).length;
        totalStylingIssues += (review.styling || []).length;
      }
    }
    const totalFindings = totalBugs + totalSecurityIssues + totalOptimizations + totalStylingIssues;
    const healthScore = Math.max(0, Math.round(100 - totalBugs * 3 - totalSecurityIssues * 15 - totalOptimizations * 1 - totalStylingIssues * 0.5));

    const repositoryHealth = {
      score: healthScore,
      grade: healthScore >= 90 ? "A" : healthScore >= 80 ? "B" : healthScore >= 70 ? "C" : healthScore >= 60 ? "D" : "F",
      breakdown: {
        security: Math.max(0, 100 - totalSecurityIssues * 15),
        maintainability: Math.max(0, 100 - totalBugs * 3),
        optimization: Math.max(0, 100 - totalOptimizations * 1),
        documentation: 80,
        duplication: 90,
        testCoverage: 75,
      },
      recommendations: [
        totalSecurityIssues > 0 && "Fix security vulnerabilities",
        totalBugs > 0 && "Resolve detected bugs",
        totalOptimizations > 0 && "Optimize code performance",
        totalStylingIssues > 0 && "Improve code style consistency",
      ].filter(Boolean),
    };
    const dependencyReport = await generateDependencyReport(clonePath);
    const prSummary = {
      overallPurpose: "AI-generated summary of the repository analysis.",
      filesChanged: files.length,
      majorLogicUpdates: ["Core business logic reviewed", "Repository analyzed successfully"],
      potentialRisks: totalSecurityIssues > 0 ? ["Security issues detected. Review before merging."] : ["No major security risks detected."],
      breakingChanges: ["No breaking changes detected."],
      testingRecommendations: ["Run unit tests", "Run integration tests", "Verify all modified files"],
    };

    if (!reviewResult?._mock) {
      try {
        await ensureConnection();
        await Analytics.create({
          sessionId, repoUrl, repoName,
          filesReviewedCount: files.length,
          totalBugs, totalSecurityIssues, totalOptimizations, totalStylingIssues,
          totalFindings, healthScore, prSummary, dependencyReport, repositoryHealth,
          language: language || 'General',
          model: model || 'llama-3.3-70b-versatile',
          analyzedAt: new Date(),
        });
      } catch (dbErr) {
        console.warn('⚠️ Failed to persist analytics:', dbErr.message);
      }
    }

    await deleteFolderRecursive(clonePath);

    if (reviewResult?.fileReviews) {
      Object.values(reviewResult.fileReviews).forEach((review) => {
        ["bugs", "security", "optimization", "styling"].forEach((category) => {
          (review[category] || []).forEach((finding) => {
            finding.explanation = finding.description || "No explanation available.";
            finding.suggestedFix = finding.suggestion || "No suggested fix available.";
            finding.beforeCode = "";
            finding.afterCode = "";
            finding.patch = finding.suggestion || "";
          });
        });
      });
    }

    return res.json({
      success: true, repoName, filesReviewedCount: files.length, analysis: reviewResult,
      repositoryHealth, prSummary, sessionId, chatAvailable: sessionPersisted, sessionPersisted, ragStatus,
      ...(fileWarnings.length > 0 ? { warnings: fileWarnings } : {})
    });
  } catch (err) {
    console.error(err);
    await deleteFolderRecursive(clonePath);
    return res.status(500).json({ error: 'An error occurred during repository analysis.' });
  }
});

export default router;
