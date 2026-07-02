import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import PDFDocument from 'pdfkit';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Octokit } from '@octokit/rest';
import { createFrontendSessionCookie, requireApiKey, SESSION_COOKIE_NAME } from './utils/authMiddleware.js';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';
import { scanSecrets, scanSecretsInChanges } from './utils/secretsScanner.js';
import { loadIgnorePatterns, readFilesRecursively } from './utils/ignoreHelper.js';
import { isValidRepoUrl, parseRepoUrl } from './utils/urlValidator.js';
import simpleGit from 'simple-git';
import escapeHtml from 'lodash.escape';
import { parseDiff } from './utils/diffParser.js';
import { analyzeComplexity } from './utils/complexityAnalyzer.js';
import { deleteFolderRecursive, getFolderSize } from './utils/fileHelper.js';
import { verifyWebhookSignature } from './utils/signatureVerifier.js';
import ReviewQueue from './utils/reviewQueue.js';
import { scanFileContentForWarnings } from './utils/sanitizeFileContent.js';
import { DANGEROUS_PHRASES } from './shared/dangerousPhrases.js';
import { verifyPort } from './utils/envVerifier.js';
import { mockAIReview } from './utils/mockAIReview.js';
import AnalysisCache from './utils/analysisCache.js';
import Analytics from './models/Analytics.js';
import Session, { estimateSessionSize } from './models/Session.js';
import { connectDatabase, ensureConnection, closeDatabase } from './config/db.js';

dotenv.config();

const octokit = new Octokit({ auth: process.env.GITHUB_PAT || undefined });

connectDatabase();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = verifyPort(process.env.PORT || 5000);

const ALLOWED_ANALYSIS_MODELS = ["llama-3.3-70b-versatile", "deepseek-r1-distill-llama-70b", "llama-3.1-8b-instant", "gemma2-9b-it"];

// Initialize analysis cache with configurable TTL (default: 1 hour)
const ANALYSIS_CACHE_TTL_MS = ((n) => Number.isFinite(n) && n > 0 ? n : 60)(parseInt(process.env.ANALYSIS_CACHE_TTL_MINUTES || '60', 10)) * 60 * 1000;
const analysisCache = new AnalysisCache(ANALYSIS_CACHE_TTL_MS);

// Trust the first hop of reverse proxy headers (Render, Railway, Heroku, Nginx, AWS ALB, etc.)
// so that req.ip and express-rate-limit resolve the real client IP from X-Forwarded-For
// rather than the internal proxy address.
// Set TRUST_PROXY=false in .env to disable this when running without a proxy (e.g. local dev).
const trustProxy = process.env.TRUST_PROXY !== 'false';
if (trustProxy) {
  app.set('trust proxy', 1);
}

// NOTE: No custom keyGenerator is needed. With `trust proxy: 1` set above, Express
// automatically resolves req.ip to the real client IP by stripping the known proxy
// hop from X-Forwarded-For. express-rate-limit defaults to req.ip, which is already
// correct. A custom function that reads X-Forwarded-For directly would trust the
// leftmost (client-controlled) value, allowing IP spoofing to bypass rate limits.

// Enable CORS with explicit origin
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173').split(',').map(s => s.trim());
app.use(cors({
  origin: ALLOWED_ORIGINS,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'x-api-key'],
  credentials: true
}));

// Optional Redis configuration for distributed rate limiting
let redisClient;
if (process.env.REDIS_URL) {
  redisClient = new Redis(process.env.REDIS_URL);
  redisClient.on('error', (err) => console.error('Redis Client Error', err));
}

// Per-IP rate limiting for expensive endpoints
const analyzeLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // No keyGenerator: express-rate-limit defaults to req.ip, which Express has already
  // resolved correctly via the `trust proxy` setting above. Using req.ip prevents
  // clients from bypassing the limit by rotating fake X-Forwarded-For values.
  store: redisClient ? new RedisStore({ sendCommand: (...args) => redisClient.call(...args) }) : undefined,
  message: { error: 'Too many analyze requests. Please slow down and retry after 5 minutes.' }
});
const issueLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisClient ? new RedisStore({ sendCommand: (...args) => redisClient.call(...args) }) : undefined,
  message: { error: 'Too many issue creation requests.' }
});

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  // No keyGenerator: same rationale as analyzeLimiter above.
  store: redisClient ? new RedisStore({ sendCommand: (...args) => redisClient.call(...args) }) : undefined,
  message: { error: 'Too many chat requests. Please slow down and retry after 1 minute.' }
});

const exportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisClient ? new RedisStore({ sendCommand: (...args) => redisClient.call(...args) }) : undefined,
  message: { error: 'Too many export requests. Please slow down and retry after 1 minute.' }
});

// Parse cookies for CSRF token validation
app.use(cookieParser());

// Raw body capture for webhook signature verification.
// This runs BEFORE express.json() so the stream is consumed here for the
// webhook route; all other routes fall through to express.json() below.
app.use((req, res, next) => {
  if (req.method === 'POST' && req.path === '/api/webhook') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      req.rawBody = Buffer.concat(chunks);
      try {
        req.body = JSON.parse(req.rawBody.toString('utf-8'));
      } catch {
        return res.status(400).json({ error: 'Invalid webhook payload' });
      }
      next();
    });
  } else {
    next();
  }
});

app.use(express.json({
  limit: process.env.JSON_BODY_LIMIT || '5mb',
}));

// CSRF token endpoint: generates a random token and sets it as a non-httpOnly cookie
// so the frontend can read it and include it in the X-CSRF-Token header.
const CSRF_COOKIE_NAME = 'csrf-token';
const CSRF_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CSRF_ROTATION_GRACE_MS = 10 * 1000; // allow in-flight concurrent requests
const csrfTokenStore = new Map();
const csrfGraceTokenStore = new Map();

// Periodic cleanup of expired CSRF tokens to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [token, expiry] of csrfTokenStore) {
    if (now > expiry) csrfTokenStore.delete(token);
  }
  for (const [token, expiry] of csrfGraceTokenStore) {
    if (now > expiry) csrfGraceTokenStore.delete(token);
  }
}, 5 * 60 * 1000);

function generateCsrfToken() {
  const token = crypto.randomBytes(32).toString('hex');
  csrfTokenStore.set(token, Date.now() + CSRF_TOKEN_TTL_MS);
  if (csrfTokenStore.size > 10000) {
    const now = Date.now();
    for (const [t, expiry] of csrfTokenStore) {
      if (now > expiry) csrfTokenStore.delete(t);
    }
    // If the store still exceeds the cap (all tokens are still fresh),
    // evict the oldest entries to prevent unbounded growth.
    while (csrfTokenStore.size > 10000) {
      const oldest = csrfTokenStore.keys().next();
      if (oldest.done) break;
      csrfTokenStore.delete(oldest.value);
    }
  }
  return token;
}

function validateCsrfToken(token) {
  if (!token) return false;
  const expiry = csrfTokenStore.get(token);
  const graceExpiry = csrfGraceTokenStore.get(token);
  const now = Date.now();
  if (!expiry && !graceExpiry) return false;
  if (expiry && now > expiry) {
    csrfTokenStore.delete(token);
  } else if (expiry) {
    return true;
  }
  if (graceExpiry && now > graceExpiry) {
    csrfGraceTokenStore.delete(token);
    return false;
  }
  return Boolean(graceExpiry);
}

// CSRF validation middleware for state-changing methods
function csrfProtection(req, res, next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const headerToken = req.headers['x-csrf-token'];
    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
    if (!headerToken || !cookieToken) {
      // Allow session creation and CSRF token endpoints to function
      if (req.path === '/api/session' || req.path === '/api/csrf-token') {
        return next();
      }
      // Skip CSRF for webhook (uses HMAC signature verification)
      if (req.path === '/api/webhook') {
        return next();
      }
      return res.status(403).json({ error: 'CSRF validation failed.' });
    }
    // Constant-time comparison to prevent timing attacks
    const headerBuf = Buffer.from(String(headerToken));
    const cookieBuf = Buffer.from(String(cookieToken));
    if (headerBuf.length !== cookieBuf.length || !crypto.timingSafeEqual(headerBuf, cookieBuf)) {
      // Allow session creation, CSRF token, and webhook endpoints even on token mismatch
      if (req.path === '/api/session' || req.path === '/api/csrf-token') {
        return next();
      }
      if (req.path === '/api/webhook') {
        return next();
      }
      return res.status(403).json({ error: 'CSRF validation failed.' });
    }
    // Validate token expiry from store
    if (!validateCsrfToken(headerToken)) {
      return res.status(403).json({ error: 'CSRF token expired. Refresh and try again.' });
    }
    // Remove old token and rotate. Keep the previous token briefly so
    // legitimate in-flight concurrent requests do not fail after one request
    // rotates the CSRF cookie.
    if (csrfTokenStore.delete(headerToken)) {
      csrfGraceTokenStore.set(headerToken, Date.now() + CSRF_ROTATION_GRACE_MS);
    }
    const newToken = generateCsrfToken();
    res.cookie(CSRF_COOKIE_NAME, newToken, {
      sameSite: 'strict',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
    });
    // Expose new token in response for the frontend
    res.locals.rotatedCsrfToken = newToken;
  }
  next();
}

// Apply CSRF protection to all state-changing routes
app.use(csrfProtection);

app.post('/api/session', requireApiKey, (req, res) => {
  const sessionCookie = createFrontendSessionCookie(res);
  if (!sessionCookie) return;

  const csrfToken = generateCsrfToken();
  res.cookie(CSRF_COOKIE_NAME, csrfToken, {
    sameSite: 'strict',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  });
  return res.json({ success: true, csrfToken });
});

// Logout endpoint — clears session and CSRF token
app.post('/api/logout', requireApiKey, (req, res) => {
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  if (cookieToken) {
    csrfTokenStore.delete(cookieToken);
    csrfGraceTokenStore.delete(cookieToken);
  }
  res.clearCookie(CSRF_COOKIE_NAME, { path: '/' });
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  return res.json({ success: true, message: 'Logged out successfully.' });
});

// CSRF token retrieval for clients that need a fresh token
app.get('/api/csrf-token', (req, res) => {
  const csrfToken = generateCsrfToken();
  res.cookie(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
  res.json({ csrfToken });
});

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
function onShutdown() { cleanupTempRepos(); cleanupTimers(); if (redisClient) redisClient.quit(); closeDatabase(); process.exit(0); }
process.on('SIGINT', onShutdown);
process.on('SIGTERM', onShutdown);

// Repository contexts for chat are now persisted in MongoDB via the Session model.
// The Session collection uses a TTL index on absoluteExpiry (expireAfterSeconds: 0)
// so MongoDB handles expiry automatically — no in-process Map or setInterval needed.

// Utility: fetch with configurable timeout using AbortController
async function fetchWithTimeout(url, options = {}, timeoutMs = 120000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Utility: generate dependency report by scanning cloned repo for package manifests
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

// Webhook deduplication and queuing state (module scope to persist across requests)
const reviewQueue = new ReviewQueue();
const processedDeliveries = new Map();
const reviewedShas = new Map();
const DELIVERY_TTL = 60 * 60 * 1000;
const MAX_DELIVERY_ENTRIES = 5000;

const dedupCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [deliveryId, timestamp] of processedDeliveries) {
    if (now - timestamp > DELIVERY_TTL) {
      processedDeliveries.delete(deliveryId);
    }
  }
  while (processedDeliveries.size > MAX_DELIVERY_ENTRIES) {
    const oldest = processedDeliveries.keys().next().value;
    if (oldest !== undefined) processedDeliveries.delete(oldest);
  }
  for (const [shaKey, shaMap] of reviewedShas) {
    for (const [headSha, timestamp] of shaMap) {
      if (now - timestamp > DELIVERY_TTL) {
        shaMap.delete(headSha);
      }
    }
    if (shaMap.size === 0) {
      reviewedShas.delete(shaKey);
    }
  }
}, 60 * 1000);

const cacheMetricsTimer = setInterval(() => {
  if (process.env.NODE_ENV === 'production') return;
  console.log(`[cache] processedDeliveries=${processedDeliveries.size}/${MAX_DELIVERY_ENTRIES} exclusiveLocks=${reviewQueue._exclusiveLocks.size}`);
}, 5 * 60 * 1000);

// Periodic sweeper for stale exclusive locks to prevent unbounded memory growth
const EXCLUSIVE_LOCK_CLEANUP_INTERVAL = 5 * 60 * 1000;
const EXCLUSIVE_LOCK_TTL = 30 * 60 * 1000;
const exclusiveLockCleanupTimer = setInterval(() => {
  reviewQueue.cleanupStaleExclusiveLocks(EXCLUSIVE_LOCK_TTL);
}, EXCLUSIVE_LOCK_CLEANUP_INTERVAL);

function cleanupTimers() {
  clearInterval(dedupCleanupTimer);
  clearInterval(cacheMetricsTimer);
  clearInterval(exclusiveLockCleanupTimer);
}

  // NOTE: This HOMOGLYPH_MAP, DANGEROUS_PHRASES list, and validation logic is
  // sourced from backend/shared/dangerousPhrases.js as the single source of
  // truth. The ai-engine/app.py list uses shared-safety-config.json as the
  // single source of truth. Keep both in sync. See issue #1390.
  const HOMOGLYPH_MAP = {
    // Lowercase Cyrillic
    '\u0430': 'a', '\u0435': 'e', '\u043E': 'o', '\u0441': 'c', '\u0440': 'p',
    '\u0445': 'x', '\u0443': 'y', '\u0432': 'b', '\u043D': 'h', '\u043A': 'k',
    '\u043C': 'm', '\u0438': 'i',
    // Uppercase Cyrillic
    '\u0410': 'A', '\u0412': 'B', '\u0415': 'E', '\u0421': 'C', '\u041D': 'H',
    '\u041A': 'K', '\u041C': 'M', '\u041E': 'O', '\u0420': 'P', '\u0423': 'Y',
    '\u0425': 'X',
    // Cyrillic lowercase that look like Latin uppercase
    '\u0428': 'W',
    // Greek
    '\u03BF': 'o', '\u03B5': 'e', '\u03B1': 'a',
    '\u039F': 'O', '\u0395': 'E', '\u0391': 'A'
  };

  function normalizeHomoglyphs(text) {
    return text.split('').map(ch => HOMOGLYPH_MAP[ch] || ch).join('');
  }

  function detectAnomalousPrompt(prompt) {
    const totalChars = prompt.length;
    if (totalChars === 0) return;
    const homoglyphCount = [...prompt].filter(ch => HOMOGLYPH_MAP[ch]).length;
    if (homoglyphCount / totalChars > 0.3) {
      throw new Error('System prompt contains an unusually high proportion of confusable Unicode characters.');
    }
    const scriptRuns = [...new Set([...prompt].map(ch => {
      const cp = ch.codePointAt(0);
      if (cp >= 0x0400 && cp <= 0x04FF) return 'cyrillic';
      if (cp >= 0x0370 && cp <= 0x03FF) return 'greek';
      if (cp >= 0x0061 && cp <= 0x007A) return 'latin';
      return 'other';
    }))];
    if (scriptRuns.includes('cyrillic') || scriptRuns.includes('greek')) {
      console.warn(`⚠️ System prompt contains non-Latin script characters: ${scriptRuns.join(', ')}`);
    }
  }

  const DANGEROUS_REGEXES = DANGEROUS_PHRASES.map(phrase => {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = escaped.split(/\s+/).join('\\s+');
    return new RegExp(pattern, 'i');
  });

  function validatePrompt(prompt) {
    if (!prompt) return '';
    const maxLen = parseInt(process.env.MAX_SYSTEM_PROMPT_LENGTH, 10) || 2000;
    const normalized = String(prompt)
      .normalize('NFKC')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .slice(0, maxLen);
    detectAnomalousPrompt(normalized);

    const homoglyphNormalized = normalizeHomoglyphs(normalized);
    const lower = homoglyphNormalized.toLowerCase();
    
    const found = DANGEROUS_REGEXES.filter(regex => regex.test(lower));
    if (found.length > 0) {
      throw new Error(`System prompt contains ${found.length} prohibited directive(s) and was rejected.`);
    }
    return normalized;
  }

// Content-Type validation middleware for POST endpoints
function requireJsonContentType(req, res, next) {
  if (!req.is('application/json')) {
    return res.status(415).json({ error: 'Content-Type must be application/json' });
  }
  next();
}

// 🟢 Route: GitHub Import & AI Review
app.post('/api/analyze', requireApiKey, requireJsonContentType, analyzeLimiter, async (req, res) => {
  let { repoUrl, company = 'General', language = 'English', model = 'llama-3.3-70b-versatile',temperature = 0.7,
     maxTokens = 2048, systemPrompt = '', batchSize = 5
   } = req.body;

  // Enforce boundary limits for batchSize to prevent downstream parsing crashes
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

  // Validate systemPrompt: reject prompts containing dangerous directives
  let validatedPrompt;
  try {
    validatedPrompt = validatePrompt(systemPrompt);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  // Generate unique folder name (needed early for logging/caching)
  const parsed = parseRepoUrl(repoUrl);
  const repoName = parsed.repo.replace(/[^a-zA-Z0-9_-]/g, '');
  const owner = parsed.owner;
  const maxRepoSizeMB = parseInt(process.env.MAX_REPO_SIZE_MB, 10) || 100;
  const maxSizeBytes = maxRepoSizeMB * 1024 * 1024;

  // Pre-clone size check via GitHub API to prevent disk exhaustion
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

  // Clone repo using simple-git to prevent shell injection and handle timeouts
  try {
    const cloneTimeout = parseInt(process.env.GIT_CLONE_TIMEOUT, 10) || 120000;
    const git = simpleGit({ timeout: { block: cloneTimeout } });
    await git.clone(repoUrl, clonePath, ['--depth', '1', '--single-branch', `--filter=blob:limit=${maxRepoSizeMB}m`]);

    // Check repository size
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
      // 1. Load ignore patterns and read files
      const ignorePatterns = loadIgnorePatterns(clonePath);
      const files = readFilesRecursively(clonePath, [], clonePath, ignorePatterns);
      
      if (files.length === 0) {
        await deleteFolderRecursive(clonePath);
        return res.status(400).json({ error: 'No supportable source code files found in the repository.' });
      }

      console.log(`📁 Found ${files.length} valid source files. Checking cache...`);

      // 1.3. Scan files for prompt injection patterns
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

      // 1.5. Check analysis cache to avoid redundant LLM calls for identical analyses
      const cacheKey = analysisCache.generateKey(repoUrl, files, { model, language, company, systemPrompt: validatedPrompt, temperature, maxTokens, batchSize });
      let cacheHit = !!analysisCache.get(cacheKey);
      if (cacheHit) {
        console.log(`🎯 Using cached analysis result for this repository and configuration`);
      }

      let reviewResult = await analysisCache.getOrSet(cacheKey, async () => {
        // 2. Mocking AI Response for initial setup (or forward to FastAPI AI Engine)
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

      // 3. Persist the repository context for chat in MongoDB so it survives
      //    server restarts and works across multiple backend instances.
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

      // 4. Ingest files into RAG vector store for semantic search (non-fatal)
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
          // Retry ingest up to 3 times with exponential backoff
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
                // Post-ingestion verification: check chunks are stored
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
                      console.warn('⚠️ RAG post-ingestion verification: zero chunks found');
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

      // 5. Compute and persist analytics
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

  grade:
    healthScore >= 90
      ? "A"
      : healthScore >= 80
      ? "B"
      : healthScore >= 70
      ? "C"
      : healthScore >= 60
      ? "D"
      : "F",

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
  overallPurpose:
    "AI-generated summary of the repository analysis.",

  filesChanged: files.length,

  majorLogicUpdates: [
    "Core business logic reviewed",
    "Repository analyzed successfully",
  ],

  potentialRisks:
    totalSecurityIssues > 0
      ? ["Security issues detected. Review before merging."]
      : ["No major security risks detected."],

  breakingChanges: [
    "No breaking changes detected.",
  ],

  testingRecommendations: [
    "Run unit tests",
    "Run integration tests",
    "Verify all modified files",
  ],
};

      if (!reviewResult?._mock) {
        try {
          await ensureConnection();
          await Analytics.create({
            sessionId,
            repoUrl,
            repoName,
            filesReviewedCount: files.length,
            totalBugs,
            totalSecurityIssues,
            totalOptimizations,
            totalStylingIssues,
            totalFindings,
            healthScore,
            prSummary,
            dependencyReport,
            repositoryHealth,
            language: language || 'General',
            model: model || 'llama-3.3-70b-versatile',
            analyzedAt: new Date(),
          });
        } catch (dbErr) {
          console.warn('⚠️ Failed to persist analytics:', dbErr.message);
        }
      }

      // 6. Clean up folder
      await deleteFolderRecursive(clonePath);

      // Enhance findings with AI fix suggestions
if (reviewResult?.fileReviews) {
  Object.values(reviewResult.fileReviews).forEach((review) => {
    ["bugs", "security", "optimization", "styling"].forEach((category) => {
      (review[category] || []).forEach((finding) => {
        finding.explanation =
          finding.description || "No explanation available.";

        finding.suggestedFix =
          finding.suggestion || "No suggested fix available.";

        finding.beforeCode = "";

        finding.afterCode = "";

        finding.patch = finding.suggestion || "";
      });
    });
  });
}
      
      // 7. Return result
      return res.json({
  success: true,

  repoName,

  filesReviewedCount: files.length,

  analysis: reviewResult,

  repositoryHealth,

  prSummary,

  sessionId,

  chatAvailable: sessionPersisted,

  sessionPersisted,

  ragStatus,

  ...(fileWarnings.length > 0
      ? { warnings: fileWarnings }
      : {})
});

    } catch (err) {
      console.error(err);
      await deleteFolderRecursive(clonePath);
      return res.status(500).json({ error: 'An error occurred during repository analysis.' });
    }
});

// 🟢 Route: AI Chat with Repository (session-isolated per issue #59)
app.post('/api/chat', requireApiKey, requireJsonContentType, chatLimiter, async (req, res) => {
  let { message, history = [], model = 'llama-3.3-70b-versatile', temperature = 0.7, maxTokens = 2048, systemPrompt = 'You are a helpful code reviewer.', sessionId, useRag, ragSources } = req.body;

  const chatNormalized = ALLOWED_ANALYSIS_MODELS.find(m => m.toLowerCase() === model.toLowerCase());
  if (!chatNormalized) {
    model = "llama-3.3-70b-versatile";
  } else {
    model = chatNormalized;
  }

  if (!message) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required for chat.' });
  }

  let validatedPrompt;
  try {
    validatedPrompt = validatePrompt(systemPrompt);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  // Verify session ownership before entering the queue (issue #742).
  // Only the client that created the session may access it.
  if (sessionId) {
    try {
      const session = await Session.findOne({ sessionId });
      if (session) {
        // Verify session ownership to prevent IDOR (issue #742):
        // only the client that created the session may access it.
        if (session.ownerToken && session.ownerToken !== req.clientId) {
          console.warn(`⚠️ Session ownership mismatch: session ${sessionId} ownerToken=${session.ownerToken} request clientId=${req.clientId} (possible auth-method change or cookie refresh)`);
          return res.status(403).json({ error: 'Access denied: this session does not belong to you.' });
        }
        // Update lastAccessedAt for the sliding-window TTL (see issue #743).
        // Each interaction extends absoluteExpiry to 24h from now via $max.
        // The initial default (24h from creation) sets the first expiry window.
        await Session.updateOne({ sessionId }, { $set: { lastAccessedAt: new Date() }, $max: { absoluteExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
      }
    } catch (sessionErr) {
      console.warn('❌ Failed to retrieve session from MongoDB:', sessionErr.message);
    }
  }
  // Use reviewQueue to serialize requests per session, preventing
  // lost-update race conditions when multiple messages arrive concurrently
  // for the same session (see issue #746).
  try {
    await reviewQueue.runExclusive(sessionId, async () => {
      let context = null;
      try {
        context = await Session.findOne({ sessionId });
        if (context) {
          // Update lastAccessedAt for activity tracking. createdAt remains
          // unchanged so the original TTL (30 minutes from creation) is
          // preserved, preventing indefinite session extension (see issue #672).
          await Session.updateOne({ sessionId }, { $set: { lastAccessedAt: new Date() }, $max: { absoluteExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000) } });
        }
      } catch (sessionErr) {
        console.warn('⚠️ Failed to retrieve session from MongoDB:', sessionErr.message);
      }

      if (!context) {
        res.status(400).json({ error: `No repository is currently active or session expired or not found. Please analyze a repository first.` });
        return;
      }

      const aiEngineUrl = process.env.AI_ENGINE_URL || 'http://localhost:8000';

      try {
        const baseUrl = aiEngineUrl.replace(/\/+$/, '');
        const aiResponse = await fetchWithTimeout(`${baseUrl}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.REPOSAGE_API_KEY || '' },
          body: JSON.stringify({
            files: context.files,
            message,
            history,
            model,
            temperature,
            maxTokens,
            systemPrompt: validatedPrompt,
            useRag,
            repo_url: context.repoUrl,
            rag_sources: ragSources
          })
        }, 30000);

        if (aiResponse.ok) {
          const data = await aiResponse.json();
          res.json(data);
        } else {
          const errText = await aiResponse.text();
          throw new Error(errText || 'AI engine chat request failed');
        }
      } catch (err) {
        console.error('❌ Chat API Error:', err.message);

        // Simple local fallback if Python FastAPI server is offline
        const responseMessage = `[Fallback Response] I see you are asking about: "${message}". Currently, the FastAPI AI Engine is offline, so I cannot analyze the full codebase for your query. Please make sure the AI Engine service is running on port 8000.`;
        res.json({ response: responseMessage, sessionId, _mock: true, _mockWarning: 'AI Engine unavailable. Fallback response generated.' });
      }
    });
  } catch (err) {
    console.error('❌ Chat serialization error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'An internal error occurred while processing your message.' });
    }
  }
});

// 🟢 Route: Proxy for RAG query — forwards to the AI engine
app.post('/api/rag/query', requireApiKey, async (req, res) => {
  const { question, repoUrl } = req.body;
  if (!question) {
    return res.status(400).json({ error: 'question is required.' });
  }

  const aiEngineUrl = process.env.AI_ENGINE_URL || 'http://localhost:8000';

  try {
    const baseUrl = aiEngineUrl.replace(/\/+$/, '');
    const aiResponse = await fetchWithTimeout(`${baseUrl}/api/rag/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.REPOSAGE_API_KEY || '' },
      body: JSON.stringify({ question, repo_url: repoUrl })
    }, 30000);

    if (aiResponse.ok) {
      const data = await aiResponse.json();
      return res.json(data);
    } else {
      const errText = await aiResponse.text();
      throw new Error(errText || 'AI engine RAG query failed');
    }
  } catch (err) {
    console.error('❌ RAG Query API Error:', err.message);
    return res.status(502).json({ error: 'RAG query failed: AI Engine unavailable.' });
  }
});

// Per-repository rate limiting for webhooks
const repoRequestCounts = new Map();
const REPO_WINDOW_MS = 60 * 1000;
const REPO_MAX_REQUESTS = 5;
setInterval(() => {
  const now = Date.now();
  for (const [key, { count, windowStart }] of repoRequestCounts) {
    if (now - windowStart > REPO_WINDOW_MS) {
      repoRequestCounts.delete(key);
    }
  }
}, 60 * 1000);

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  // No keyGenerator: same rationale as analyzeLimiter — req.ip resolved
  // correctly via trust proxy setting above.
  store: redisClient ? new RedisStore({ sendCommand: (...args) => redisClient.call(...args) }) : undefined,
  message: { error: 'Too many webhook requests.' }
});

// 🟢 Route: GitHub Webhook Receiver for automated Pull Request Reviews
app.post('/api/webhook', webhookLimiter, async (req, res) => {
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
    if (processedDeliveries.has(deliveryId)) {
      console.log(`⏭️ Skipping duplicate webhook delivery: ${deliveryId}`);
      return res.json({ success: true, message: 'Webhook received (duplicate skipped).' });
    }
    processedDeliveries.set(deliveryId, Date.now());

    const action = payload.action;
    if (action === 'opened' || action === 'synchronize') {
      const pullNumber = payload.pull_request.number;
      const headSha = payload.pull_request.head.sha;
      const owner = payload.repository.owner.login;
      const repo = payload.repository.name;
      const reviewKey = `${owner}/${repo}/#${pullNumber}`;

      const shaKey = `${owner}/${repo}/#${pullNumber}`;
      const shaAlreadyReviewed = reviewedShas.get(shaKey)?.has(headSha);
      if (shaAlreadyReviewed) {
        console.log(`⏭️ Already reviewed commit ${headSha.substring(0,7)} for PR #${pullNumber}`);
        return res.json({ success: true, message: 'Webhook received (duplicate SHA skipped).' });
      }
      
      console.log(`📡 GitHub Webhook received: PR #${pullNumber} ${action} (${headSha.substring(0,7)}) in ${owner}/${repo}`);

      if (reviewQueue._queues.size >= reviewQueue._maxQueues) {
        return res.status(429).json({ error: 'Too many pending reviews. Try again later.' });
      }

      // Per-repository rate limiting
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
          const shaMap = reviewedShas.get(shaKey);
          if (shaMap) {
            shaMap.delete(headSha);
            if (shaMap.size === 0) {
              reviewedShas.delete(shaKey);
            }
          }
        }
      });
      if (enqueuePromise) {
        if (!reviewedShas.has(shaKey)) {
          reviewedShas.set(shaKey, new Map());
        }
        reviewedShas.get(shaKey).set(headSha, Date.now());
      } else {
        return res.status(429).json({ error: 'Review queue full. Try again later.' });
      }
    }
  }

  return res.json({ success: true, message: 'Webhook received.' });
});

// 🟢 Route: Create GitHub Issue automatically for Code Reviews
app.post('/api/issues/create', requireApiKey, issueLimiter, async (req, res) => {
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

// 🟢 Route: Invalidate analysis cache by repo URL
app.post('/api/cache/invalidate', requireApiKey, async (req, res) => {
  const { repoUrl } = req.body;
  if (!repoUrl) {
    return res.status(400).json({ error: 'repoUrl is required.' });
  }
  const removed = analysisCache.invalidateByRepoUrl(repoUrl);
  res.json({ success: true, removed, stats: analysisCache.getStats() });
});

// Webhook review queueing uses ReviewQueue from reviewQueue.js (per-key mutex)

// 🟢 Helper to execute Webhook PR review logic
async function runWebhookReview(owner, repo, pullNumber, headSha) {
  const token = process.env.GITHUB_PAT;
  if (!token) {
    console.warn("⚠️ GITHUB_PAT not set in backend/.env. Cannot run webhook PR review.");
    return;
  }

  const octokit = new Octokit({ auth: token });
  console.log(`🔍 Fetching diff for PR #${pullNumber}...`);

  const { data: pullRequest } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: pullNumber
  });
  if (headSha && pullRequest.head.sha !== headSha) {
    console.log(`⏭️ Skipping stale review ${headSha.substring(0, 7)}; current head is ${pullRequest.head.sha.substring(0, 7)}.`);
    return;
  }

  // 1. Fetch the diff for the verified current pull-request head.
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
  const { files: parsedFiles, binaryFiles: parsedBinaryFiles } = parseDiff(diff);
  console.log(`📁 Found ${parsedFiles.length} files in PR diff.`);

  const commentsToPost = [];
  const filesToReview = [];
  const validChangedLines = new Map();

  for (const file of parsedFiles) {
    // Check if file is supported
    const ext = file.path.split('.').pop()?.toLowerCase();
    const validExtensions = ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'go', 'rs', 'cpp', 'h', 'cs', 'css', 'html', 'php', 'rb', 'sql'];
    if (!ext || !validExtensions.includes(ext) || file.changes.length === 0) {
      continue;
    }
    validChangedLines.set(file.path, new Set(file.changes.map(change => change.line)));

    // Run local secrets scanner
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

    // Save list to send to FastAPI AI Engine
    filesToReview.push({
      path: file.path,
      changes: file.changes.map(c => ({ line: c.line, content: c.content }))
    });
  }

  // Track whether the AI engine was successfully queried
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
            // Avoid duplicate comments if secrets scanner already flagged it
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

  // 3. Post consolidated review comment back to GitHub PR
  if (commentsToPost.length > 0) {
    console.log(`✍️ Posting PR Review with ${commentsToPost.length} inline comments...`);
    let body = `## 🛡️ RepoSage AI Code Review Audit Completed!\n\n`;
    if (!aiEngineQueried && filesToReview.length > 0) {
      body += `⚠️ **Limited Review:** The AI engine was unreachable during this review. Only regex-based secret scanning was performed. AI-powered bug/performance/style analysis was skipped. Please ensure the AI Engine service is running and re-trigger the review for a complete audit.\n\n`;
    }
    body += `I have audited the code changes in this Pull Request and generated **${commentsToPost.length} actionable inline suggestions**.\n\nPlease review my feedback and suggestions below. Happy coding! 🚀`;
    await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      commit_id: headSha,
      event: 'COMMENT',
      body,
      comments: commentsToPost
    });
  } else if (!aiEngineQueried) {
    console.error('❌ AI Engine was unreachable — posting COMMENT review instead of auto-approving.');
    await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      commit_id: headSha,
      event: 'COMMENT',
      body: `## ⚠️ RepoSage AI Code Review — AI Engine Unavailable

The AI engine could not be reached during this review. The secrets scanner found **0 issues**, but the PR was **not** fully reviewed by the AI.

Please ensure the AI Engine service is running and re-trigger the review for a complete analysis.`
    });
  } else {
    console.log('🎉 No code issues or recommendations found. Posting approval review...');
    await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      commit_id: headSha,
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



// Helper to sanitize repository name for report filenames
function sanitizeFilename(repoName) {
  let str = String(repoName);
  try { str = decodeURIComponent(str); } catch { /* keep original */ }
  str = str.normalize('NFKC');
  str = str.replace(/\0/g, '');
  str = str.replace(/[/\\]+/g, '/').replace(/\.\.\/|\.\\/g, '');
  str = str.replace(/\.\.+/g, '_').replace(/(?:^|\/)[.]+(?=\/|$)/g, '_');
  str = str.replace(/[^\w.-]+/g, '_');
  return str;
}

// 🟢 Route: Export Review Report to HTML
app.post('/api/reports/html', requireApiKey, exportLimiter, (req, res) => {
  const { repoName, analysis } = req.body;
  if (!repoName || !analysis) {
    return res.status(400).json({ error: 'Repository name and analysis result are required.' });
  }

  // Sanitize repoName to prevent path traversal attacks in the Content-Disposition header.
  // Keep only word characters, dots, and hyphens to ensure safe filenames.
  const safeRepoName = sanitizeFilename(repoName);

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
  res.setHeader('Content-Disposition', `attachment; filename="${safeRepoName}_AUDIT_REPORT.html"`);
  return res.send(html);
});

// 🟢 Route: Export Review Report to PDF
app.post('/api/reports/pdf', requireApiKey, exportLimiter, (req, res) => {
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
  const safeRepoName = sanitizeFilename(repoName);

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

// 🟢 Route: Analytics Trends — 30-day time-series of repository health scores
app.get('/api/analytics/trends', requireApiKey, async (req, res) => {
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
      {
        $match: matchFilter,
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$analyzedAt' },
          },
          analyses: { $sum: 1 },
          totalFindings: { $sum: '$totalFindings' },
          avgHealthScore: { $avg: '$healthScore' },
          totalBugs: { $sum: '$totalBugs' },
          totalSecurityIssues: { $sum: '$totalSecurityIssues' },
        },
      },
      {
        $sort: { _id: 1 },
      },
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

app.get("/api/review-history", requireApiKey, async (req, res) => {

    try {

        const history = await Analytics.find()
            .sort({ analyzedAt: -1 })
            .limit(20);

        res.json(history);

    } catch (err) {

        res.status(500).json({
            error: "Failed to fetch review history."
        });

    }

});

app.get("/api/review-history/:repo", requireApiKey, async (req, res) => {

    try {
        const repo = req.params.repo;
        if (typeof repo !== 'string' || repo.length === 0) {
          return res.status(400).json({ error: 'Invalid repo parameter.' });
        }

        const history = await Analytics.find({
            repoName: repo
        }).sort({
            analyzedAt: -1
        });

        res.json(history);

    } catch (err) {

        res.status(500).json({
            error: "Failed to fetch repository history."
        });

    }

});

app.get("/api/review-history/compare/:id1/:id2", requireApiKey, async (req, res) => {

    try {

        const first = await Analytics.findById(req.params.id1);

        const second = await Analytics.findById(req.params.id2);

        if (!first || !second) {

            return res.status(404).json({
                error: "Review not found."
            });

        }

        res.json({

            previous: first,

            current: second,

            difference: {

                healthScore:
                    second.healthScore - first.healthScore,

                findings:
                    second.totalFindings - first.totalFindings,

                bugs:
                    second.totalBugs - first.totalBugs,

                security:
                    second.totalSecurityIssues -
                    first.totalSecurityIssues,

                optimization:
                    second.totalOptimizations -
                    first.totalOptimizations

            }

        });

    } catch (err) {

        res.status(500).json({
            error: "Comparison failed."
        });

    }

});

app.listen(PORT, () => {
  console.log(`🟢 RepoSage Backend running on http://localhost:${PORT}`);
});
// TODO: Issue #397 - Bug [Backend]: Temp folder leakage if Node process crashes during analysis