import 'express-async-errors';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import PDFDocument from 'pdfkit';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { Octokit } from '@octokit/rest';
import { createFrontendSessionCookie, requireApiKey, SESSION_COOKIE_NAME, validateSessionSecret, isValidUuid } from './utils/authMiddleware.js';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';
import { scanSecrets, scanSecretsInChanges } from './utils/secretsScanner.js';
import { recordAnalysis as recordFileAnalytics } from './utils/analyticsStore.js';
import { loadIgnorePatterns, readFilesRecursively } from './utils/ignoreHelper.js';
import { isValidRepoUrl, parseRepoUrl, isSafeUrl } from './utils/urlValidator.js';
import { isValidGithubToken } from './utils/tokenValidator.js';
import simpleGit from 'simple-git';
import escapeHtml from 'lodash.escape';
import { parseDiff } from './utils/diffParser.js';
import { analyzeComplexity } from './utils/complexityAnalyzer.js';
import { deleteFolderRecursive, getFolderSize } from './utils/fileHelper.js';
import { verifyWebhookSignature, verifyWebhookSignatureMulti } from './utils/signatureVerifier.js';
import ReviewQueue from './utils/reviewQueue.js';
const reviewQueue = new ReviewQueue();
import { scanFileContentForWarnings } from './utils/sanitizeFileContent.js';
import { DANGEROUS_PHRASES, HOMOGLYPH_MAP } from './shared/dangerousPhrases.js';
import { verifyPort } from './utils/envVerifier.js';
import { sanitizeRedisKey } from './utils/redisSafe.js';
import { mockAIReview } from './utils/mockAIReview.js';
import { loadConfigFile, applySeverityConfig } from './utils/severityConfig.js';
import AnalysisCache from './utils/analysisCache.js';
import { getPriorReviewIds, storeReviewIds, clearReviewIds, supersedePriorReviews } from './utils/reviewTracker.js';
import DedupStore from './utils/dedupStore.js';
import mongoose from 'mongoose';
import Analytics from './models/Analytics.js';
import Session, { estimateSessionSize } from './models/Session.js';
import { connectDatabase, isDatabaseConnected, ensureConnection, closeDatabase } from './config/db.js';

dotenv.config();

validateSessionSecret();

// Parse WEBHOOK_SECRET — supports comma-separated values for secret rotation
function parseWebhookSecrets() {
  const raw = process.env.WEBHOOK_SECRET;
  if (!raw) return [];
  return raw.split(',').map(s => s.trim()).filter(s => s.length >= 16);
}

let webhookSecrets = parseWebhookSecrets();

// Fail-fast if WEBHOOK_SECRET is not configured or is too short
(function validateWebhookSecret() {
  const secrets = parseWebhookSecrets();
  if (secrets.length === 0) {
    console.error('FATAL: WEBHOOK_SECRET must be set to at least 16 characters');
    process.exit(1);
  }
  webhookSecrets = secrets;
})();

const GITHUB_API_TIMEOUT = parseInt(process.env.GITHUB_API_TIMEOUT || '15000', 10);
const octokit = new Octokit({ auth: process.env.GITHUB_PAT || undefined, request: { timeout: GITHUB_API_TIMEOUT } });

let serverReady = false;
const serverStartTime = new Date();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = verifyPort(process.env.PORT || 5000);

const ALLOWED_ANALYSIS_MODELS = ["llama-3.3-70b-versatile", "deepseek-r1-distill-llama-70b", "llama-3.1-8b-instant", "gemma2-9b-it"];

// Configurable timeout for AI engine analysis requests (default: 120s)
const ANALYSIS_TIMEOUT_MS = parseInt(process.env.ANALYSIS_TIMEOUT_MS || '120000', 10);
// Configurable timeout for review-diff endpoint (default: 30s)
const REVIEW_DIFF_TIMEOUT_MS = parseInt(process.env.REVIEW_DIFF_TIMEOUT_MS || '30000', 10);
// Configurable timeout for webhook processing (default: 60s)
const WEBHOOK_PROCESSING_TIMEOUT_MS = parseInt(process.env.WEBHOOK_PROCESSING_TIMEOUT_MS || '60000', 10);

// Initialize analysis cache with configurable TTL (default: 1 hour, mock: 2 minutes)
const ANALYSIS_CACHE_TTL_MS = ((n) => Number.isFinite(n) && n > 0 ? n : 60)(parseInt(process.env.ANALYSIS_CACHE_TTL_MINUTES || '60', 10)) * 60 * 1000;
const ANALYSIS_CACHE_MOCK_TTL_MS = ((n) => Number.isFinite(n) && n > 0 ? n : 120)(parseInt(process.env.ANALYSIS_CACHE_MOCK_TTL_SECONDS || '120', 10)) * 1000;
const analysisCache = new AnalysisCache(ANALYSIS_CACHE_TTL_MS, ANALYSIS_CACHE_MOCK_TTL_MS);

// Trust the first hop of reverse proxy headers (Render, Railway, Heroku, Nginx, AWS ALB, etc.)
// so that req.ip and express-rate-limit resolve the real client IP from X-Forwarded-For
// rather than the internal proxy address.
// Set TRUST_PROXY=false in .env to disable this when running without a proxy (e.g. local dev).
const trustProxy = process.env.TRUST_PROXY !== 'false';
if (trustProxy) {
  app.set('trust proxy', 1);
}

// Request ID middleware — assigns a unique ID to every request for traceability in logs
app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  req._startAt = Date.now();
  next();
});

// Response time tracking — logs duration of every request
app.use((req, res, next) => {
  const { requestId } = req;
  res.on('finish', () => {
    const durationMs = Date.now() - (req._startAt || Date.now());
    console.log(`[perf] [${requestId}] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms`);
  });
  next();
});

// NOTE: No custom keyGenerator is needed. With `trust proxy: 1` set above, Express
// automatically resolves req.ip to the real client IP by stripping the known proxy
// hop from X-Forwarded-For. express-rate-limit defaults to req.ip, which is already
// correct. A custom function that reads X-Forwarded-For directly would trust the
// leftmost (client-controlled) value, allowing IP spoofing to bypass rate limits.

// Enable CORS with explicit origin and exposed headers
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173').split(',').map(s => s.trim());
app.use(cors({
  origin: ALLOWED_ORIGINS,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'x-api-key', 'X-Requested-With'],
  exposedHeaders: ['X-CSRF-Token', 'Content-Disposition', 'Content-Length'],
  credentials: true,
  maxAge: 86400,
}));

// Handle OPTIONS preflight for all routes explicitly
app.options('*', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.includes(req.headers.origin) ? req.headers.origin : ALLOWED_ORIGINS[0] || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token, x-api-key, X-Requested-With');
  res.setHeader('Access-Control-Expose-Headers', 'X-CSRF-Token, Content-Disposition, Content-Length');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.status(204).end();
});

// Optional Redis configuration for distributed rate limiting
let redisClient;
if (process.env.REDIS_URL) {
  try {
    redisClient = new Redis(process.env.REDIS_URL);
    redisClient.on('error', (err) => console.error('Redis Client Error', err));
  } catch (err) {
    console.error('Failed to connect to Redis:', err.message);
    redisClient = null;
  }
}
const dedupStore = new DedupStore(redisClient);

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
  message: { error: 'Too many HTML export requests. Please slow down and retry after 1 minute.' }
});

const pdfExportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: redisClient ? new RedisStore({ sendCommand: (...args) => redisClient.call(...args) }) : undefined,
  message: { error: 'Too many PDF export requests. Please slow down and retry after 1 minute.' }
});

// Parse cookies for CSRF token validation
app.use(cookieParser());

// Raw body capture for webhook signature verification.
// This runs BEFORE express.json() so the stream is consumed here for the
// webhook route; all other routes fall through to express.json() below.
app.use((req, res, next) => {
  if (req.method === 'POST' && req.path === '/api/webhook') {
    // Validate Content-Type before consuming the body
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
      return res.status(415).json({ error: 'Content-Type must be application/json' });
    }
    const MAX_WEBHOOK_BODY = 5 * 1024 * 1024; // 5 MB
    const chunks = [];
    let totalBytes = 0;
    let responseAlreadySent = false;
    req.on('error', () => {});
    req.on('close', () => {
      if (!responseAlreadySent) {
        responseAlreadySent = true;
        req.removeAllListeners('data');
        req.removeAllListeners('end');
      }
    });
    req.on('data', chunk => {
      if (responseAlreadySent) return;
      totalBytes += chunk.length;
      if (totalBytes > MAX_WEBHOOK_BODY) {
        responseAlreadySent = true;
        res.status(413).json({ error: 'Webhook payload too large' });
        req.removeAllListeners('data');
        req.removeAllListeners('end');
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (responseAlreadySent) return;
      req.rawBody = Buffer.concat(chunks);
      try {
        req.body = JSON.parse(req.rawBody.toString('utf-8'));
        req._body = true;
      } catch {
        responseAlreadySent = true;
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

// CSRF token endpoint: generates a random token and sets it as an httpOnly cookie.
// The token is also returned in the JSON response body so the frontend can read
// it from there (not from document.cookie) and include it in the X-CSRF-Token header.
const CSRF_COOKIE_NAME = 'csrf-token';
const CSRF_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CSRF_ROTATION_GRACE_MS = 10 * 1000; // allow in-flight concurrent requests
const csrfTokenStore = new Map();
// WARNING: In-memory CSRF store does not work across multiple server instances.
// In production with multiple replicas, CSRF tokens generated by one instance
// will be rejected by others. Replace with a shared store (e.g., Redis) for
// multi-instance deployments.
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
}, 5 * 60 * 1000).unref();

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
async function csrfProtection(req, res, next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const headerToken = req.headers['x-csrf-token'];
    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
    const sessionId = req.body?.sessionId;

    // For session-scoped endpoints, additionally validate against stored CSRF token
    if (sessionId) {
      try {
        const session = await Session.findOne({ sessionId }).select('csrfToken').lean();
        if (session && session.csrfToken) {
          const storedBuf = Buffer.from(String(session.csrfToken));
          const headerBuf = Buffer.from(String(headerToken || ''));
          if (storedBuf.length === headerBuf.length && crypto.timingSafeEqual(storedBuf, headerBuf)) {
            return next();
          }
        }
      } catch { /* fall through to normal validation */ }
    }

    if (!headerToken || !cookieToken) {
      // Allow session creation and CSRF token endpoints to function
      if (req.path.endsWith('/api/session') || req.path.endsWith('/api/csrf-token')) {
        return next();
      }
      // Skip CSRF for webhook (uses HMAC signature verification)
      if (req.path.endsWith('/api/webhook')) {
        return next();
      }
      return res.status(403).json({ error: 'CSRF validation failed.' });
    }
    // Constant-time comparison to prevent timing attacks
    const headerBuf = Buffer.from(String(headerToken));
    const cookieBuf = Buffer.from(String(cookieToken));
    if (headerBuf.length !== cookieBuf.length || !crypto.timingSafeEqual(headerBuf, cookieBuf)) {
      // Allow session creation, CSRF token, and webhook endpoints even on token mismatch
      if (req.path.endsWith('/api/session') || req.path.endsWith('/api/csrf-token')) {
        return next();
      }
      if (req.path.endsWith('/api/webhook')) {
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
      httpOnly: true,
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
  const result = createFrontendSessionCookie(res);
  if (!result) return;

  // Set req.clientId to the cookie's uid so any session created in
  // this request or subsequent requests uses the same per-client
  // identifier for ownership binding.
  req.clientId = result.clientId;

  const csrfToken = generateCsrfToken();
  res.cookie(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  });
  return res.json({ success: true, csrfToken, clientId: result.clientId });
});

// Logout endpoint ΓÇö clears session and CSRF token
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
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
  res.json({ csrfToken });
});

// Ensure temp_repos folder is clean on startup
const tempReposDir = path.join(__dirname, 'temp_repos');
try {
  if (fs.existsSync(tempReposDir)) {
    fs.rmSync(tempReposDir, { recursive: true, force: true });
  }
  fs.mkdirSync(tempReposDir, { recursive: true });
} catch (error) {
  console.warn(`ΓÜá∩╕Å Failed to clean up temp_repos directory on startup: ${error.message}`);
}

// Clean up temp_repos on process exit to avoid leftover clones
function cleanupTempRepos() {
  try {
    if (fs.existsSync(tempReposDir)) {
      fs.rmSync(tempReposDir, { recursive: true, force: true });
    }
  } catch (error) {
    console.error(`Failed to clean up temp_repos on exit: ${error.message}`);
  }
}

let httpServer = null;

async function onShutdown(signal = 'SIGTERM') {
  console.log(`≡ƒæï Received ${signal} — initiating graceful shutdown...`);

  // Stop accepting new connections
  if (httpServer) {
    await new Promise((resolve) => {
      httpServer.close(resolve);
    });
    console.log('≡ƒæï HTTP server closed — no longer accepting new connections');
  }

  cleanupTempRepos();
  cleanupTimers();
  if (redisClient) redisClient.quit();
  await closeDatabase();
  process.exit(0);
}
process.on('SIGINT', onShutdown);
process.on('SIGTERM', onShutdown);
process.on('exit', cleanupTempRepos);

// Clean up temp_repos and timers on uncaught exceptions to prevent orphan temp folders
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  if (err.stack) {
    console.error(err.stack);
  }
  cleanupTempRepos();
  cleanupTimers();
  if (redisClient) redisClient.quit();
  closeDatabase();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason instanceof Error ? reason.message : reason);
  if (reason instanceof Error && reason.stack) {
    console.error(reason.stack);
  }
});

// Repository contexts for chat are now persisted in MongoDB via the Session model.
// The Session collection uses a TTL index on absoluteExpiry (expireAfterSeconds: 0)
// so MongoDB handles expiry automatically ΓÇö no in-process Map or setInterval needed.

// Utility: retry an async operation on failure (1 retry for transient failures)
async function withRetry(fn, retries = 1) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        console.warn(`Retry attempt ${attempt + 1}/${retries} failed: ${err.message}. Retrying...`);
      }
    }
  }
  throw lastError;
}

// Utility: fetch with configurable timeout using AbortController and optional SSRF check
async function fetchWithTimeout(url, options = {}, timeoutMs = 120000) {
  if (options.validate !== false && options.validate !== true) {
    // default: skip validation for explicitly trusted URLs; validate only when requested
  }
  if (options.validate === true) {
    const safe = await isSafeUrl(url);
    if (!safe.valid) {
      throw new Error(`SSRF validation failed: ${safe.reason}`);
    }
  }
  const { validate: _validate, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
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
  'requirements.txt': async (filePath) => {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const results = [];
    const lines = content.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
    const maxCheck = 10;
    let checked = 0;
    for (const line of lines) {
      if (checked >= maxCheck) {
        results.push({ name: line.trim(), currentVersion: 'unknown', latestVersion: 'unknown', risk: 'Unknown', deprecated: false, vulnerable: false, recommendation: 'Manual review recommended.' });
        continue;
      }
      const match = line.trim().match(/^([a-zA-Z0-9_.-]+)([><=!~]+.+)?$/);
      if (match) {
        const pkgName = match[1];
        const spec = match[2] || 'latest';
        try {
          const resp = await fetch(`https://pypi.org/pypi/${encodeURIComponent(pkgName)}/json`, { signal: AbortSignal.timeout(5000) });
          if (resp.ok) {
            const data = await resp.json();
            const latest = data.info?.version || 'unknown';
            const current = spec.replace(/[><=!~]+/, '') || 'unknown';
            const isOutdated = latest !== 'unknown' && current !== 'unknown' && current !== latest;
            results.push({ name: pkgName, currentVersion: current, latestVersion: latest, risk: isOutdated ? 'Medium' : 'Low', deprecated: false, vulnerable: false, recommendation: isOutdated ? `Update from ${current} to ${latest}.` : 'Up to date.' });
          } else {
            results.push({ name: pkgName, currentVersion: spec || 'unknown', latestVersion: 'unknown', risk: 'Unknown', deprecated: false, vulnerable: false, recommendation: 'Could not check PyPI.' });
          }
        } catch {
          results.push({ name: pkgName, currentVersion: spec || 'unknown', latestVersion: 'unknown', risk: 'Unknown', deprecated: false, vulnerable: false, recommendation: 'Could not check PyPI.' });
        }
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
        console.warn(`ΓÜá∩╕Å Failed to parse ${manifest}: ${err.message}`);
      }
    }
  }
  return { dependencies: deps };
}

// Webhook deduplication using Redis SETNX for cross-instance safety
// TTL covers GitHub's webhook retry window (300s) plus anti-replay buffer
const DELIVERY_REDIS_TTL = 3600; // 1 hour — long enough to prevent replay attacks

// Maximum age of a webhook payload to accept (anti-replay)
const WEBHOOK_MAX_AGE_SECONDS = 300; // 5 minutes

// In-memory fallback for webhook SHA dedup when Redis is unavailable
const shaDedupMemoryMap = new Map();
const SHA_DEDUP_MAX_SIZE = 10000;

const cacheMetricsTimer = setInterval(() => {
  const stats = analysisCache.getStats();
  console.log(`[cache] entries=${stats.size}/${stats.maxEntries} mock=${stats.mockCount} avgAge=${stats.avgAgeMs}ms hitRate=${stats.hitRate}`);
}, 5 * 60 * 1000);
cacheMetricsTimer.unref();

// Proactive AI Engine health probe ΓÇö when the engine recovers, clear mock cache entries
const AI_ENGINE_HEALTH_INTERVAL = 30000;
let aiEngineHealthy = true;

const aiEngineHealthTimer = setInterval(async () => {
  const baseUrl = (process.env.AI_ENGINE_URL || 'http://localhost:8000').replace(/\/+$/, '');
  try {
    const resp = await fetchWithTimeout(`${baseUrl}/health`, {}, 5000);
    if (resp.ok && !aiEngineHealthy) {
      console.log('≡ƒƒó AI Engine recovered ΓÇö clearing mock cache entries');
      await analysisCache.clearMockEntries();
    }
    aiEngineHealthy = resp.ok;
  } catch {
    if (aiEngineHealthy) {
      console.warn('≡ƒö┤ AI Engine health check failed');
    }
    aiEngineHealthy = false;
  }
}, AI_ENGINE_HEALTH_INTERVAL);
aiEngineHealthTimer.unref();

// Periodic sweeper for stale exclusive locks to prevent unbounded memory growth
const EXCLUSIVE_LOCK_CLEANUP_INTERVAL = 5 * 60 * 1000;
const EXCLUSIVE_LOCK_TTL = 30 * 60 * 1000;
const exclusiveLockCleanupTimer = setInterval(() => {
  reviewQueue.cleanupStaleExclusiveLocks(EXCLUSIVE_LOCK_TTL);
}, EXCLUSIVE_LOCK_CLEANUP_INTERVAL);
exclusiveLockCleanupTimer.unref();

// Periodic sweeper for the SHA dedup memory map to prevent unbounded memory growth
const SHA_DEDUP_CLEANUP_INTERVAL = 60 * 1000;
const shaDedupCleanupTimer = setInterval(() => {
  const now = Date.now();
  const ttl = DELIVERY_REDIS_TTL * 1000;
  for (const [key, timestamp] of shaDedupMemoryMap) {
    if (now - timestamp > ttl) {
      shaDedupMemoryMap.delete(key);
    }
  }
}, SHA_DEDUP_CLEANUP_INTERVAL);
shaDedupCleanupTimer.unref();

// Webhook delivery stats tracking (#2457)
const webhookStats = {
  totalDeliveries: 0,
  successfulDeliveries: 0,
  failedDeliveries: 0,
  totalDurationMs: 0,
  minDurationMs: Infinity,
  maxDurationMs: 0,
  deliveriesByEvent: {},
  startedAt: Date.now(),
};

function recordWebhookStats(event, success, durationMs) {
  webhookStats.totalDeliveries++;
  if (success) {
    webhookStats.successfulDeliveries++;
  } else {
    webhookStats.failedDeliveries++;
  }
  webhookStats.totalDurationMs += durationMs;
  if (durationMs < webhookStats.minDurationMs) webhookStats.minDurationMs = durationMs;
  if (durationMs > webhookStats.maxDurationMs) webhookStats.maxDurationMs = durationMs;
  if (!webhookStats.deliveriesByEvent[event]) {
    webhookStats.deliveriesByEvent[event] = { total: 0, success: 0, fail: 0 };
  }
  webhookStats.deliveriesByEvent[event].total++;
  if (success) {
    webhookStats.deliveriesByEvent[event].success++;
  } else {
    webhookStats.deliveriesByEvent[event].fail++;
  }
}

// Periodic webhook stats logger
const webhookStatsTimer = setInterval(() => {
  const avgDuration = webhookStats.totalDeliveries > 0
    ? Math.round(webhookStats.totalDurationMs / webhookStats.totalDeliveries)
    : 0;
  console.log(`[webhook-stats] total=${webhookStats.totalDeliveries} success=${webhookStats.successfulDeliveries} fail=${webhookStats.failedDeliveries} avg=${avgDuration}ms min=${webhookStats.minDurationMs === Infinity ? 0 : webhookStats.minDurationMs}ms max=${webhookStats.maxDurationMs}ms events=${Object.keys(webhookStats.deliveriesByEvent).length}`);
}, 5 * 60 * 1000);
webhookStatsTimer.unref();

function cleanupTimers() {
  clearInterval(cacheMetricsTimer);
  clearInterval(aiEngineHealthTimer);
  clearInterval(exclusiveLockCleanupTimer);
  clearInterval(shaDedupCleanupTimer);
  clearInterval(webhookStatsTimer);
}

  // Loaded from shared-safety-config.json via dangerousPhrases.js

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

// ≡ƒƒó Route: GitHub Import & AI Review
app.post('/api/analyze', requireApiKey, requireJsonContentType, analyzeLimiter, async (req, res) => {
  let { repoUrl, prNumber, company = 'General', language = 'English', model = 'llama-3.3-70b-versatile',temperature = 0.7,
     maxTokens = 2048, systemPrompt = '', batchSize = 5, githubToken,
     limit, offset
   } = req.body;
  // Also support query-string pagination params
  if (limit === undefined && req.query.limit !== undefined) limit = parseInt(req.query.limit, 10);
  if (offset === undefined && req.query.offset !== undefined) offset = parseInt(req.query.offset, 10);
  limit = Math.max(1, Math.min(200, parseInt(limit, 10) || 200));
  offset = Math.max(0, parseInt(offset, 10) || 0);

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

  // Validate repo URL format before any other processing
  if (!isValidRepoUrl(repoUrl)) {
    return res.status(400).json({ error: 'Invalid GitHub repository URL. Only https://github.com/owner/repo URLs are allowed.' });
  }

  // Validate prNumber if provided (must be a positive integer)
  if (prNumber !== undefined && prNumber !== null) {
    const parsedPr = parseInt(prNumber, 10);
    if (!Number.isInteger(parsedPr) || parsedPr < 1) {
      return res.status(400).json({ error: 'PR number must be a positive integer.' });
    }
    prNumber = parsedPr;
  }

  if (githubToken && !isValidGithubToken(githubToken)) {
    return res.status(400).json({ error: 'Invalid GitHub Token format provided' });
  }

  // Validate systemPrompt: reject prompts containing dangerous directives
  let validatedPrompt;
  try {
    validatedPrompt = validatePrompt(systemPrompt);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  // Request-level dedup: if an identical request is already in-flight, wait for it
  const dedupKey = `analyze:${repoUrl}:${model}:${language}:${company}:${validatedPrompt}:${temperature}:${maxTokens}:${batchSize}`;
  const existingDedup = await dedupStore.get(dedupKey);
  if (existingDedup) {
    console.log(`≡ƒÅ╗ Deduplicating to in-flight analysis for ${repoUrl}`);
    return res.json(JSON.parse(existingDedup));
  }

  // Generate unique folder name (needed early for logging/caching)
  const parsed = parseRepoUrl(repoUrl);
  const repoName = parsed.repo.replace(/[^a-zA-Z0-9_.-]/g, '');
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
        console.error(`Γ¥î GitHub API error verifying size for ${owner}/${repoName}: ${err.message}`);
        return res.status(502).json({ error: `Failed to verify repository size: ${err.message}. Check GITHUB_PAT configuration.` });
      }
      console.warn(`Could not verify repository size via GitHub API for ${owner}/${repoName}. Proceeding to clone with filters...`);
    }
  } else {
    console.warn('No GITHUB_PAT configured ΓÇö skipping pre-clone size check. Set MAX_REPO_SIZE_MB to enforce limit at clone time.');
  }

  const uniqueId = crypto.randomUUID();
  const clonePath = path.join(tempReposDir, `${repoName}_${uniqueId}`);

  console.log(`≡ƒÜÇ Cloning: ${repoUrl} into ${clonePath}`);

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
    console.error(`Γ¥î Git Clone Error: ${error.message}`);
    await deleteFolderRecursive(clonePath);
    return res.status(500).json({ error: 'Failed to clone repository. Make sure the URL is public and within size limits.' });
  }

    // Set dedup before analysis work begins; clear on response finish or error
    const dedupTtlMs = Math.max(ANALYSIS_TIMEOUT_MS, 120000);
    await dedupStore.set(dedupKey, 'pending', dedupTtlMs);
    const clearDedup = () => { dedupStore.delete(dedupKey).catch(() => {}); };
    const originalJson = res.json.bind(res);
    res.json = function(body) { clearDedup(); return originalJson(body); };
    res.on('error', clearDedup);
    res.on('close', clearDedup);

    try {
      // 1. Load ignore patterns and read files
      const ignorePatterns = loadIgnorePatterns(clonePath);
      const severityConfig = loadConfigFile(clonePath);
      let files = readFilesRecursively(clonePath, [], clonePath, ignorePatterns);
      
      let partial_review = false;
      const MAX_PAYLOAD_CHARS = 30000;
      let currentPayloadLength = 0;
      let truncatedFiles = [];
      for (const file of files) {
        if (currentPayloadLength + file.content.length > MAX_PAYLOAD_CHARS) {
          partial_review = true;
          const allowedChars = MAX_PAYLOAD_CHARS - currentPayloadLength;
          if (allowedChars > 0) {
            truncatedFiles.push({ ...file, content: file.content.substring(0, allowedChars) });
          }
          break;
        }
        truncatedFiles.push(file);
        currentPayloadLength += file.content.length;
      }
      files = truncatedFiles;
      
      if (files.length === 0) {
        await deleteFolderRecursive(clonePath);
        return res.status(400).json({ error: 'No supportable source code files found in the repository.' });
      }

      console.log(`≡ƒôü Found ${files.length} valid source files. Checking cache...`);

      // 1.3. Scan files for prompt injection patterns
      const fileWarnings = [];
      for (const file of files) {
        const fileScanWarnings = scanFileContentForWarnings(file.content);
        for (const warning of fileScanWarnings) {
          fileWarnings.push({ file: file.name, warning });
        }
      }
      if (fileWarnings.length > 0) {
        console.warn(`ΓÜá∩╕Å Found ${fileWarnings.length} potential prompt injection patterns across ${files.length} files`);
      }

      // 1.5. Check analysis cache to avoid redundant LLM calls for identical analyses
      const cacheKey = analysisCache.generateKey(repoUrl, files, { model, language, company, systemPrompt: validatedPrompt, temperature, maxTokens, batchSize });
      let cacheHit = !!analysisCache.get(cacheKey);
      if (cacheHit) {
        console.log(`≡ƒÄ» Using cached analysis result for this repository and configuration`);
      }

      let reviewResult = await analysisCache.getOrSet(cacheKey, async () => {
        // 2. Mocking AI Response for initial setup (or forward to FastAPI AI Engine)
        const aiEngineUrl = process.env.AI_ENGINE_URL || 'http://localhost:8000';
        const baseUrl = aiEngineUrl.replace(/\/+$/, '');
        try {
          const aiResponse = await withRetry(() => fetchWithTimeout(`${baseUrl}/analyze`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.REPOSAGE_API_KEY || '' },
            body: JSON.stringify({ files, company, language, model, temperature, maxTokens, systemPrompt: validatedPrompt, batchSize })
          }, ANALYSIS_TIMEOUT_MS), 1);

          if (aiResponse.ok) {
            const resData = await aiResponse.json();
            resData._mock = false;
            return resData;
          } else {
            throw new Error('AI engine responded with error');
          }
        } catch (err) {
          console.warn('ΓÜá∩╕Å FastAPI engine not running, falling back to local Express review handler');
          const mockRes = mockAIReview(files, model);
          mockRes._mock = true;
          mockRes._mockWarning = true;
          return mockRes;
        }
      }, repoUrl);

      // 3. Inject Regex-based Secret Detections & Complexity Metrics into the analysis result
      if (reviewResult && reviewResult.fileReviews) {
        if (!reviewResult.metrics) reviewResult.metrics = {};
        
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
          
          if (reviewResult.fileReviews[file.name]) {
            ['bugs', 'security', 'optimization', 'styling'].forEach(cat => {
              if (reviewResult.fileReviews[file.name][cat]) {
                reviewResult.fileReviews[file.name][cat] = applySeverityConfig(
                  reviewResult.fileReviews[file.name][cat],
                  severityConfig
                );
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
      let sessionOwnerToken = null;
      let sessionPersisted = false;
      let csrfToken = null;
      if (estimatedSize <= MAX_SESSION_DOC_SIZE) {
        sessionId = crypto.randomUUID();
        sessionOwnerToken = crypto.randomUUID();
        csrfToken = generateCsrfToken();
        try {
          await Session.create({
            sessionId,
            repoUrl,
            repoName,
            files: storedFiles,
            lastAccessedAt: new Date(),
            ownerToken: sessionOwnerToken,
            csrfToken,
          });
          sessionPersisted = true;
        } catch (sessionErr) {
          console.warn('ΓÜá∩╕Å Failed to persist session context:', sessionErr.message);
        }
      } else {
        console.warn(`ΓÜá∩╕Å Session too large (${(estimatedSize / 1024 / 1024).toFixed(1)}MB), skipping persistence`);
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
                      console.warn('ΓÜá∩╕Å RAG post-ingestion verification: zero chunks found');
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
                await ingestResp.body?.cancel();
                throw new Error(`Ingest responded with ${ingestResp.status}`);
              }
            } catch (ingestErr) {
              if (attempt < 3) {
                const delay = Math.pow(2, attempt) * 1000;
                console.warn(`ΓÜá∩╕Å RAG ingest attempt ${attempt} failed, retrying in ${delay}ms:`, ingestErr.message);
                await new Promise(r => setTimeout(r, delay));
              } else {
                console.error(`Γ¥î RAG ingest failed after 3 attempts:`, ingestErr.message);
                ragStatus = 'failed';
              }
            }
          }
        } else {
          await splitResp.body?.cancel();
          ragStatus = 'split_failed';
        }
      } catch (ragErr) {
        console.warn('ΓÜá∩╕Å RAG ingestion failed (non-fatal):', ragErr.message);
        ragStatus = 'failed';
        fileWarnings.push({ file: '(global)', warning: 'RAG code context ingestion failed ΓÇö review may have limited accuracy' });
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
    documentation: null,
    duplication: null,
    testCoverage: null,
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
        if (isDatabaseConnected()) {
          try {
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
            console.warn('MongoDB analytics write failed, falling back to file:', dbErr.message);
            await recordFileAnalytics({ repoName, totalLines: files.length, bugs: totalBugs, security: totalSecurityIssues, optimization: totalOptimizations, styling: totalStylingIssues, filesCount: files.length }).catch(() => {});
          }
        } else {
          await recordFileAnalytics({ repoName, totalLines: files.length, bugs: totalBugs, security: totalSecurityIssues, optimization: totalOptimizations, styling: totalStylingIssues, filesCount: files.length }).catch(() => {});
        }
      }

      // 6. Clean up folder
      await deleteFolderRecursive(clonePath);

      // Enhance findings with AI fix suggestions (deep clone to avoid cache corruption)
if (reviewResult?.fileReviews) {
  reviewResult = JSON.parse(JSON.stringify(reviewResult));
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
      
      // 7. Set CSRF cookie if session was persisted
      if (sessionPersisted) {
        res.cookie(CSRF_COOKIE_NAME, csrfToken, {
          httpOnly: true,
          sameSite: 'strict',
          path: '/',
          secure: process.env.NODE_ENV === 'production',
        });
      }

      // 8. Apply pagination (limit/offset) to fileReviews
      if (reviewResult && reviewResult.fileReviews) {
        const fileEntries = Object.entries(reviewResult.fileReviews);
        const totalFiles = fileEntries.length;
        const paginated = fileEntries.slice(offset, offset + limit);
        reviewResult.fileReviews = Object.fromEntries(paginated);
        reviewResult._pagination = { total: totalFiles, limit, offset, returned: paginated.length };
      }

      // 8. Return result
      return res.json({ ...(sessionPersisted ? { csrfToken } : {}),
  success: true,

  repoName,

  filesReviewedCount: files.length,

  analysis: reviewResult,
  
  partial_review,

  _mock: reviewResult?._mock,

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
      console.error(`[${req.requestId}] [repo=${repoUrl}] Analysis failed:`, err.message);
      if (err.stack) console.error(`[${req.requestId}] [repo=${repoUrl}]`, err.stack);
      await deleteFolderRecursive(clonePath);
      // Attempt to return a cached or generic fallback result instead of a 500 error
      try {
        const mockRes = mockAIReview(files || [], model);
        mockRes._mock = true;
        mockRes._mockWarning = true;
        const fallbackResponse = {
          success: true, repoName, filesReviewedCount: (files || []).length,
          analysis: mockRes, partial_review: false, _mock: true,
          repositoryHealth: { score: 0, grade: 'N/A', breakdown: {}, recommendations: ['AI service was unavailable — showing generic fallback.'] },
          prSummary: { overallPurpose: 'Fallback — AI service unavailable.', filesChanged: 0, majorLogicUpdates: [], potentialRisks: [], breakingChanges: [], testingRecommendations: [] },
          sessionId: null, chatAvailable: false, sessionPersisted: false, ragStatus: 'skipped'
        };
        return res.json(fallbackResponse);
      } catch (fallbackErr) {
        return res.status(500).json({ error: 'An error occurred during repository analysis.' });
      }
    }
});

// ≡ƒƒó Route: Direct File Analysis (for VS Code extension and single-file use cases)
app.post('/api/analyze-file', requireApiKey, requireJsonContentType, analyzeLimiter, async (req, res) => {
  try {
    let { files, company = 'General', language = 'English', model = 'llama-3.3-70b-versatile', temperature = 0.7, maxTokens = 2048, systemPrompt = '', batchSize = 5 } = req.body;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'At least one file is required.' });
    }

    for (const file of files) {
      if (!file.name || !file.content) {
        return res.status(400).json({ error: 'Each file must have a name and content.' });
      }
    }

    batchSize = Math.max(1, Math.min(20, parseInt(batchSize, 10) || 5));
    temperature = Math.max(0, Math.min(2, parseFloat(temperature) || 0.7));
    maxTokens = Math.max(1, Math.min(128000, parseInt(maxTokens, 10) || 2048));

    const normalizedModel = ALLOWED_ANALYSIS_MODELS.find(m => m.toLowerCase() === model.toLowerCase());
    if (!normalizedModel) {
      model = "llama-3.3-70b-versatile";
    } else {
      model = normalizedModel;
    }

    let validatedPrompt;
    try {
      validatedPrompt = validatePrompt(systemPrompt);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const fileWarnings = [];
    for (const file of files) {
      const scanResult = scanFileContentForWarnings(file.content);
      for (const warning of scanResult) {
        fileWarnings.push({ file: file.name, warning });
      }
    }

    const aiEngineUrl = process.env.AI_ENGINE_URL || 'http://localhost:8000';
    const baseUrl = aiEngineUrl.replace(/\/+$/, '');

    let reviewResult;
    try {
      const aiResponse = await withRetry(() => fetchWithTimeout(`${baseUrl}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.REPOSAGE_API_KEY || '' },
        body: JSON.stringify({ files, company, language, model, temperature, maxTokens, systemPrompt: validatedPrompt, batchSize })
      }, ANALYSIS_TIMEOUT_MS), 1);

      if (aiResponse.ok) {
        const resData = await aiResponse.json();
        reviewResult = resData;
      } else if (aiResponse.status === 401) {
        const errData = await aiResponse.json().catch(() => ({}));
        throw new Error(errData.error || 'AI Engine authentication failed');
      } else {
        throw new Error('AI engine responded with error');
      }
    } catch (err) {
      if (err.message.includes('authentication failed')) {
        throw err;
      }
      const { mockAIReview } = await import('./utils/mockAIReview.js');
      const mockRes = mockAIReview(files, model);
      mockRes._mock = true;
      mockRes._mockWarning = true;
      reviewResult = mockRes;
    }

    if (reviewResult && reviewResult.fileReviews) {
      if (!reviewResult.metrics) reviewResult.metrics = {};
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

    return res.json({
      success: true,
      analysis: reviewResult,
      source: 'direct',
      _mock: reviewResult?._mock || false,
      _mockWarning: reviewResult?._mockWarning || undefined,
      ...(fileWarnings.length > 0 ? { warnings: fileWarnings } : {})
    });
  } catch (err) {
    console.error('File analysis failed:', err);
    return res.status(500).json({ error: 'An error occurred during file analysis.' });
  }
});

// ≡ƒƒó Route: AI Chat with Repository (session-isolated per issue #59)
app.post('/api/chat', requireApiKey, requireJsonContentType, chatLimiter, async (req, res) => {
  let { message, history = [], model = 'llama-3.3-70b-versatile', temperature = 0.7, maxTokens = 2048, systemPrompt = 'You are a helpful code reviewer.', sessionId, sessionOwnerToken, useRag, ragSources } = req.body;

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
  if (!isValidUuid(sessionId)) {
    return res.status(400).json({ error: 'Invalid sessionId format.' });
  }

  let validatedPrompt;
  try {
    validatedPrompt = validatePrompt(systemPrompt);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  // Use reviewQueue to serialize requests per session, preventing
  // lost-update race conditions when multiple messages arrive concurrently
  // for the same session (see issue #746). Session ownership verification
  // is performed INSIDE the exclusive lock to avoid TOCTOU races (issue #1809).
  try {
    await reviewQueue.runExclusive(sessionId, async () => {
      let context = null;
      try {
        context = await Session.findOne({ sessionId });
      } catch (sessionErr) {
        console.warn('ΓÜá∩╕Å Failed to retrieve session from MongoDB:', sessionErr.message);
      }

      if (!context) {
        res.status(400).json({ error: `No repository is currently active or session expired or not found. Please analyze a repository first.` });
        return;
      }

      // Verify session ownership to prevent IDOR (issue #742).
      // The caller must provide the correct sessionOwnerToken that was set during session creation.
      if (context.ownerToken) {
        if (!sessionOwnerToken) {
          console.warn(`ΓÜá∩╕Å Session ownership validation failed: session ${sessionId} missing sessionOwnerToken in request`);
          res.status(403).json({ error: 'Access denied: sessionOwnerToken is required.' });
          return;
        }
        const sessionDoc = await Session.findById(context._id).select('ownerToken').lean();
        if (!sessionDoc || !sessionDoc.ownerToken) {
          console.warn(`ΓÜá∩╕Å Session ownership validation failed: session ${sessionId} missing ownerToken in database`);
          res.status(403).json({ error: 'Access denied: session not found or missing owner token.' });
          return;
        }
        const providedBuf = Buffer.from(String(sessionOwnerToken), 'utf8');
        const storedBuf = Buffer.from(String(sessionDoc.ownerToken), 'utf8');
        if (providedBuf.length !== storedBuf.length || !crypto.timingSafeEqual(providedBuf, storedBuf)) {
          console.warn(`ΓÜá∩╕Å Session ownership mismatch: session ${sessionId} token does not match`);
          res.status(403).json({ error: 'Access denied: this session does not belong to you.' });
          return;
        }
      } else {
        // Sessions without ownerToken cannot be accessed via chat
        res.status(403).json({ error: 'Access denied: session has no ownership token.' });
        return;
      }

      // Extend TTL atomically with ownership check, inside the lock
      await Session.updateOne({ sessionId }, { $set: { lastAccessedAt: new Date() }, $max: { absoluteExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000) } });

      const aiEngineUrl = process.env.AI_ENGINE_URL || 'http://localhost:8000';

      try {
        const baseUrl = aiEngineUrl.replace(/\/+$/, '');
        const aiResponse = await withRetry(() => fetchWithTimeout(`${baseUrl}/chat`, {
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
        }, 30000), 1);

        if (aiResponse.ok) {
          const data = await aiResponse.json();
          res.json(data);
        } else {
          const errText = await aiResponse.text();
          throw new Error(sanitizeErrorMessage(errText) || 'AI engine chat request failed');
        }
      } catch (err) {
        console.error('Γ¥î Chat API Error:', sanitizeErrorMessage(err.message));

        // Simple local fallback if Python FastAPI server is offline
        const responseMessage = `[Fallback Response] I see you are asking about: "${message}". Currently, the FastAPI AI Engine is offline, so I cannot analyze the full codebase for your query. Please make sure the AI Engine service is running on port 8000.`;
        res.json({ response: responseMessage, sessionId, _mock: true, _mockWarning: 'AI Engine unavailable. Fallback response generated.' });
      }
    });
  } catch (err) {
    console.error('Γ¥î Chat serialization error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'An internal error occurred while processing your message.' });
    }
  }
});

// ≡ƒƒó Route: Proxy for RAG query ΓÇö forwards to the AI engine
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
      throw new Error(sanitizeErrorMessage(errText) || 'AI engine RAG query failed');
    }
  } catch (err) {
    console.error('Γ¥î RAG Query API Error:', sanitizeErrorMessage(err.message));
    return res.status(502).json({ error: 'RAG query failed: AI Engine unavailable.' });
  }
});

// Per-repository rate limiting for webhooks
const repoRequestCounts = new Map();
const REPO_WINDOW_MS = 60 * 1000;
const REPO_MAX_REQUESTS = 5;
const RATE_LIMITER_STATE_PATH = path.join(__dirname, 'data', 'rate_limiter_state.json');
setInterval(() => {
  const now = Date.now();
  for (const [key, { count, windowStart }] of repoRequestCounts) {
    if (now - windowStart > REPO_WINDOW_MS) {
      repoRequestCounts.delete(key);
    }
  }
}, 60 * 1000).unref();

function persistRateLimiterState() {
  try {
    const dir = path.dirname(RATE_LIMITER_STATE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const now = Date.now();
    const valid = [];
    for (const [key, { count, windowStart }] of repoRequestCounts) {
      if (now - windowStart <= REPO_WINDOW_MS) {
        valid.push({ key, count, windowStart, windowEnd: windowStart + REPO_WINDOW_MS });
      }
    }
    fs.writeFileSync(RATE_LIMITER_STATE_PATH, JSON.stringify(valid));
  } catch (err) {
    console.warn('ΓÜá∩╕Å Rate limiter state persist failed:', err.message);
  }
}

function restoreRateLimiterState() {
  try {
    if (!fs.existsSync(RATE_LIMITER_STATE_PATH)) return 0;
    const raw = fs.readFileSync(RATE_LIMITER_STATE_PATH, 'utf-8');
    const entries = JSON.parse(raw);
    const now = Date.now();
    let restored = 0;
    for (const entry of entries) {
      if (now - entry.windowStart > REPO_WINDOW_MS) continue;
      repoRequestCounts.set(entry.key, { count: entry.count, windowStart: entry.windowStart });
      restored++;
    }
    if (restored > 0) {
      console.log(`Γô½∩╕Å Restored ${restored} rate limiter state entries from disk`);
    }
    return restored;
  } catch (err) {
    console.warn('ΓÜá∩╕Å Rate limiter state restore failed:', err.message);
    return 0;
  }
}

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  // No keyGenerator: same rationale as analyzeLimiter ΓÇö req.ip resolved
  // correctly via trust proxy setting above.
  store: redisClient ? new RedisStore({ sendCommand: (...args) => redisClient.call(...args) }) : undefined,
  message: { error: 'Too many webhook requests.' }
});

// ≡ƒƒó Route: GitHub Webhook Receiver for automated Pull Request Reviews
app.post('/api/webhook', webhookLimiter, async (req, res) => {
  const payload = req.body;
  const repoUrl = payload?.repository ? `https://github.com/${payload.repository.owner?.login || '?'}/${payload.repository.name || '?'}` : 'unknown';

  if (!webhookSecrets || webhookSecrets.length === 0) {
    console.error(`[${req.requestId}] [repo=${repoUrl}] Γ¥î WEBHOOK_SECRET not configured`);
    return res.status(500).json({ error: 'Webhook secret not configured. Set WEBHOOK_SECRET in environment.' });
  }

  const signature = req.headers['x-hub-signature-256'];
  if (!signature) {
    return res.status(401).json({ error: 'Missing X-Hub-Signature-256 header.' });
  }

  if (!verifyWebhookSignatureMulti(req.rawBody, signature, webhookSecrets)) {
    console.warn(`[${req.requestId}] [repo=${repoUrl}] Γ¥î Webhook signature verification failed`);
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  const event = req.headers['x-github-event'];

  if (!event || typeof event !== 'string') {
    return res.status(400).json({ error: 'Missing x-github-event header.' });
  }
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Invalid webhook payload.' });
  }
  if (event !== 'pull_request' && event !== 'push' && event !== 'ping') {
    return res.status(400).json({ error: `Unsupported webhook event: ${event}` });
  }

  // Anti-replay: reject webhook payloads whose timestamp is too old
  // For pull_request events, use pull_request.updated_at; for push, use head_commit.timestamp
  if (event === 'pull_request' || event === 'push') {
    let payloadTime;
    if (event === 'pull_request') {
      payloadTime = payload.pull_request?.updated_at;
    } else {
      payloadTime = payload.head_commit?.timestamp;
    }
    if (payloadTime) {
      const payloadDate = new Date(payloadTime);
      if (isNaN(payloadDate.getTime())) {
        console.warn(`[${req.requestId}] [repo=${repoUrl}] Webhook payload has unparseable timestamp`);
      } else if (Date.now() - payloadDate.getTime() > WEBHOOK_MAX_AGE_SECONDS * 1000) {
        console.warn(`[${req.requestId}] [repo=${repoUrl}] Rejecting stale webhook payload (age=${Math.round((Date.now() - payloadDate.getTime()) / 1000)}s)`);
        return res.status(403).json({ error: 'Webhook payload is too old — possible replay attack.' });
      }
    }
  }

  // Anti-replay nonce: store the delivery ID with extended TTL so the same
  // payload cannot be replayed within the retention window (even if the HMAC
  // signature is valid). The per-delivery nonce check happens inside the
  // pull_request branch below where x-github-delivery is validated.

  // Validate webhook payload structure against expected schema
  const payloadErrors = validateWebhookPayload(event, payload);
  if (payloadErrors.length > 0) {
    console.warn(`[${req.requestId}] [repo=${repoUrl}] ⚠️ Webhook payload validation failed for ${event}: ${payloadErrors.join(', ')}`);
    return res.status(400).json({ error: `Invalid webhook payload: ${payloadErrors.join('; ')}` });
  }

  if (event === 'push') {
    const owner = payload.repository?.owner?.login;
    const repo = payload.repository?.name;
    if (owner && repo) {
      const repoUrl = `https://github.com/${owner}/${repo}`;
      const removed = await analysisCache.invalidateByRepoUrl(repoUrl);
      if (removed > 0) {
        console.log(`[${req.requestId}] [repo=${repoUrl}] Push event invalidated ${removed} cache entries`);
      }
    }
  }

  if (event === 'pull_request') {
    let deliveryId = req.headers['x-github-delivery'];
    if (!deliveryId || typeof deliveryId !== 'string') {
      return res.status(400).json({ error: 'Missing x-github-delivery header.' });
    }
    const GITHUB_DELIVERY_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!GITHUB_DELIVERY_UUID_RE.test(deliveryId)) {
      console.warn(`Rejected malformed x-github-delivery header: ${deliveryId}`);
      return res.status(400).json({ error: 'Invalid delivery ID format.' });
    }
    const safeDeliveryId = sanitizeRedisKey(deliveryId);
    const deliveryDedupKey = `webhook:delivery:${safeDeliveryId}`;
    let isDuplicate;
    if (redisClient) {
      isDuplicate = await redisClient.setnx(deliveryDedupKey, Date.now().toString());
    } else {
      const existing = await dedupStore.get(deliveryDedupKey);
      isDuplicate = existing ? 0 : 1;
      if (isDuplicate) {
        await dedupStore.set(deliveryDedupKey, Date.now().toString(), DELIVERY_REDIS_TTL * 1000);
      }
    }
    if (isDuplicate === 0) {
      console.log(`ΓÅ¡∩╕Å Skipping duplicate webhook delivery: ${deliveryId}`);
      return res.json({ success: true, message: 'Webhook received (duplicate skipped).' });
    }
    if (redisClient) {
      await redisClient.expire(deliveryDedupKey, DELIVERY_REDIS_TTL);
    }

    const action = payload.action;
    if (action === 'opened' || action === 'synchronize') {
      const pullNumber = payload.pull_request.number;
      const headSha = payload.pull_request.head.sha;
      const owner = payload.repository.owner.login;
      const repo = payload.repository.name;
      const reviewKey = `${owner}/${repo}/#${pullNumber}`;

      const shaKey = `${sanitizeRedisKey(owner)}/${sanitizeRedisKey(repo)}/#${sanitizeRedisKey(String(pullNumber))}`;
      const shaDedupKey = `webhook:sha:${shaKey}`;
      let shaAlreadyReviewed;
      if (redisClient) {
        const added = await redisClient.sadd(shaDedupKey, headSha);
        if (!added) {
          shaAlreadyReviewed = 1;
        } else {
          shaAlreadyReviewed = 0;
          await redisClient.expire(shaDedupKey, DELIVERY_REDIS_TTL);
        }
      } else {
        const mapKey = `${shaDedupKey}:${headSha}`;
        shaAlreadyReviewed = shaDedupMemoryMap.has(mapKey) ? 1 : 0;
        if (!shaAlreadyReviewed) {
          // Enforce max size cap with oldest-entry eviction
          if (shaDedupMemoryMap.size >= SHA_DEDUP_MAX_SIZE) {
            const oldestKey = shaDedupMemoryMap.keys().next().value;
            if (oldestKey !== undefined) {
              shaDedupMemoryMap.delete(oldestKey);
            }
          }
          shaDedupMemoryMap.set(mapKey, Date.now());
        }
      }
      if (shaAlreadyReviewed) {
        console.log(`ΓÅ¡∩╕Å Already reviewed commit ${headSha.substring(0,7)} for PR #${pullNumber}`);
        return res.json({ success: true, message: 'Webhook received (duplicate SHA skipped).' });
      }
      
      console.log(`≡ƒôí GitHub Webhook received: PR #${pullNumber} ${action} (${headSha.substring(0,7)}) in ${owner}/${repo}`);

      if (reviewQueue._queues.size >= reviewQueue._maxQueues) {
        if (redisClient) {
          await redisClient.srem(shaDedupKey, headSha);
        } else {
          shaDedupMemoryMap.delete(`${shaDedupKey}:${headSha}`);
        }
        return res.status(429).json({ error: 'Too many pending reviews. Try again later.' });
      }

      // Per-repository rate limiting
      const repoKey = `${owner}/${repo}`;
      let currentCount;
      if (redisClient) {
        const redisKey = `ratelimit:repo:${repoKey}`;
        currentCount = await redisClient.incr(redisKey);
        if (currentCount === 1) {
          await redisClient.expire(redisKey, Math.ceil(REPO_WINDOW_MS / 1000));
        }
      } else {
        const now = Date.now();
        const repoEntry = repoRequestCounts.get(repoKey) || { count: 0, windowStart: now };
        if (now - repoEntry.windowStart > REPO_WINDOW_MS) {
          repoEntry.count = 0;
          repoEntry.windowStart = now;
        }
        repoEntry.count++;
        repoRequestCounts.set(repoKey, repoEntry);
        currentCount = repoEntry.count;
      }

      if (currentCount > REPO_MAX_REQUESTS) {
        console.warn(`ΓÜá∩╕Å Rate limit exceeded for repository ${repoKey}`);
        if (redisClient) {
          await redisClient.srem(shaDedupKey, headSha);
        } else {
          shaDedupMemoryMap.delete(`${shaDedupKey}:${headSha}`);
        }
        return res.status(429).json({ error: 'Too many requests for this repository. Try again later.' });
      }

      const requestId = req.requestId;

      // Dedup: skip if same PR is already queued or in-flight (#2455)
      if (reviewQueue.isActive(reviewKey)) {
        console.log(`[${requestId}] PR #${pullNumber} already has an active analysis in ${owner}/${repo} — skipping duplicate`);
        if (redisClient) {
          await redisClient.srem(shaDedupKey, headSha);
        } else {
          shaDedupMemoryMap.delete(`${shaDedupKey}:${headSha}`);
        }
        return res.status(200).json({ success: true, message: 'Webhook received (PR already being analyzed).' });
      }

      // Fire-and-forget: process review asynchronously, return 202 immediately
      // with configurable timeout and stats tracking
      reviewQueue.enqueue(reviewKey, { owner, repo, pullNumber, headSha }, async (item) => {
        const webhookStartTime = Date.now();
        try {
          // Wrap with configurable timeout (#2454)
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Webhook processing timed out')), WEBHOOK_PROCESSING_TIMEOUT_MS)
          );
          await Promise.race([
            runWebhookReview(item.owner, item.repo, item.pullNumber, item.headSha, requestId),
            timeoutPromise
          ]);
          recordWebhookStats(event, true, Date.now() - webhookStartTime);
        } catch (error) {
          const duration = Date.now() - webhookStartTime;
          recordWebhookStats(event, false, duration);
          console.error(`[${requestId}] Γ¥î Webhook review failed for ${headSha}:`, error.message);
          // Report the error back to the user via a PR review comment
          try {
            const errOctokit = new Octokit({ auth: process.env.GITHUB_PAT, request: { timeout: GITHUB_API_TIMEOUT } });
            await errOctokit.rest.pulls.createReview({
              owner: item.owner,
              repo: item.repo,
              pull_number: item.pullNumber,
              commit_id: item.headSha,
              event: 'COMMENT',
              body: `## ΓÜá∩╕Å RepoSage AI Code Review — Error\n\nThe automated code review encountered an error and could not complete:\n\n**Error:** ${sanitizeErrorMessage(error.message)}\n\nPlease ensure the AI Engine service is running correctly and re-trigger the review.`
            });
          } catch (postErr) {
            console.error(`[${requestId}] Γ¥î Failed to post error comment on PR #${item.pullNumber}:`, postErr.message);
          }
          if (redisClient) {
            await redisClient.srem(shaDedupKey, headSha);
          } else {
            shaDedupMemoryMap.delete(`${shaDedupKey}:${headSha}`);
          }
        }
      }).catch(err => {
        console.error(`[${requestId}] Γ¥î Enqueue failed for PR #${pullNumber}:`, err.message);
      });
      // Return 202 Accepted — processing continues asynchronously
      return res.status(202).json({ success: true, message: 'Webhook accepted, processing review asynchronously.' });
    } else if (action === 'closed') {
      // Covers both merged and closed-without-merging PRs. Clear the tracked
      // review so a later reopen of this same PR number doesn't try to
      // supersede a review from a previous, already-finished lifecycle.
      const pullNumber = payload.pull_request.number;
      const owner = payload.repository.owner.login;
      const repo = payload.repository.name;
      if (redisClient) {
        await clearReviewIds(redisClient, owner, repo, pullNumber);
      }
      // Also clear the SHA dedup so reopening the PR allows a fresh review
      const shaKey = `${sanitizeRedisKey(owner)}/${sanitizeRedisKey(repo)}/#${sanitizeRedisKey(String(pullNumber))}`;
      const shaDedupKey = `webhook:sha:${shaKey}`;
      if (redisClient) {
        await redisClient.del(shaDedupKey);
      } else {
        for (const [mapKey] of shaDedupMemoryMap) {
          if (mapKey.startsWith(shaDedupKey)) {
            shaDedupMemoryMap.delete(mapKey);
          }
        }
      }
    }
  }

  return res.json({ success: true, message: 'Webhook received.' });
});

// ≡ƒƒó Route: Create GitHub Issue automatically for Code Reviews
app.post('/api/issues/create', requireApiKey, requireJsonContentType, issueLimiter, async (req, res) => {
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
    const octokit = new Octokit({ auth: token, request: { timeout: GITHUB_API_TIMEOUT } });
    
    console.log(`≡ƒñû Creating GitHub Issue in ${owner}/${repo}: "${title}"`);
    
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
    console.error('Γ¥î Create GitHub Issue Error:', err.message);
    return res.status(500).json({ error: `Failed to create issue: ${err.message}` });
  }
});

// ≡ƒƒó Route: Invalidate analysis cache by repo URL
app.post('/api/cache/invalidate', requireApiKey, async (req, res) => {
  const { repoUrl } = req.body;
  if (!repoUrl) {
    return res.status(400).json({ error: 'repoUrl is required.' });
  }
  if (!isValidRepoUrl(repoUrl)) {
    return res.status(400).json({ error: 'Invalid GitHub repository URL. Only https://github.com/owner/repo URLs are allowed.' });
  }
  const removed = await analysisCache.invalidateByRepoUrl(repoUrl);
  res.json({ success: true, removed, stats: analysisCache.getStats() });
});

// Webhook review queueing uses ReviewQueue from reviewQueue.js (per-key mutex)

// Validate webhook payload structure against expected schema per event type
function validateWebhookPayload(event, payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') {
    errors.push('payload must be an object');
    return errors;
  }
  if (event === 'push') {
    if (!payload.repository?.owner?.login) errors.push('missing repository.owner.login');
    if (!payload.repository?.name) errors.push('missing repository.name');
    if (!payload.ref) errors.push('missing ref');
  } else if (event === 'pull_request') {
    if (!payload.pull_request?.number) errors.push('missing pull_request.number');
    if (!payload.pull_request?.head?.sha) errors.push('missing pull_request.head.sha');
    if (!payload.repository?.owner?.login) errors.push('missing repository.owner.login');
    if (!payload.repository?.name) errors.push('missing repository.name');
    if (!payload.action) errors.push('missing action');
  }
  // ping events require no specific payload fields
  return errors;
}

// ≡ƒƒó Helper to execute Webhook PR review logic
async function runWebhookReview(owner, repo, pullNumber, headSha, requestId) {
  const token = process.env.GITHUB_PAT;
  if (!token) {
    console.warn(`[${requestId}] ΓÜá∩╕Å GITHUB_PAT not set in backend/.env. Cannot run webhook PR review.`);
    return;
  }

  const octokit = new Octokit({ auth: token, request: { timeout: GITHUB_API_TIMEOUT } });
  console.log(`[${requestId}] ≡ƒöì Fetching diff for PR #${pullNumber}...`);

  const { data: pullRequest } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: pullNumber
  });
  if (headSha && pullRequest.head.sha !== headSha) {
    console.log(`[${requestId}] ΓÅ¡∩╕Å Skipping stale review ${headSha.substring(0, 7)}; current head is ${pullRequest.head.sha.substring(0, 7)}.`);
    return;
  }

  // Skip notification if the PR author is the reviewer bot itself
  try {
    const { data: botUser } = await octokit.rest.users.getAuthenticated();
    if (botUser && botUser.login && pullRequest.user && pullRequest.user.login === botUser.login) {
      console.log(`[${requestId}] ΓÅ¡∩╕Å PR #${pullNumber} authored by bot user (${botUser.login}) — skipping review notification`);
      return;
    }
  } catch (err) {
    console.warn(`[${requestId}] ΓÜá∩╕Å Could not fetch authenticated user for bot self-check: ${err.message}`);
  }

  // Supersede whatever review was posted for a prior commit on this PR, so
  // repeated pushes update the review in place instead of accumulating a
  // new duplicate comment thread on every `synchronize` event.
  const priorReviewIds = redisClient ? await getPriorReviewIds(redisClient, owner, repo, pullNumber) : [];
  if (priorReviewIds.length > 0) {
    console.log(`[${requestId}] ΓÖ╗∩╕Å Superseding ${priorReviewIds.length} review(s) from a previous commit on PR #${pullNumber}...`);
    await supersedePriorReviews(octokit, owner, repo, pullNumber, priorReviewIds);
  }
  const postedReviewIds = [];

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
    console.warn(`[${requestId}] ΓÜá∩╕Å No diff found for this PR.`);
    return;
  }

  // 2. Parse files and changes
  const { files: parsedFiles, binaryFiles: parsedBinaryFiles } = parseDiff(diff);
  console.log(`[${requestId}] ≡ƒôü Found ${parsedFiles.length} files in PR diff.`);

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
        body: `<!-- RepoSage Review Comment -->\n${escapeHtml(String(f.comment))}`
      });
    });
    if (scanTruncated) {
      console.warn(`[${requestId}] ΓÜá∩╕Å Secrets scan truncated for ${file.path}: ${scanReason} (total ${scanTotal} changes)`);
    }

    // Save list to send to FastAPI AI Engine
    filesToReview.push({
      path: file.path,
      changes: file.changes.map(c => ({ line: c.line, content: c.content }))
    });
  }

  // Track whether the AI engine was successfully queried
  let aiEngineQueried = false;
  let aiCommentsDiscarded = 0;
  // Set when the AI engine dropped files because the diff exceeded its review limit
  let reviewDiffTruncated = false;

  if (filesToReview.length > 0) {
    console.log(`[${requestId}] ≡ƒºá Querying AI engine for ${filesToReview.length} files...`);
    const aiEngineUrl = process.env.AI_ENGINE_URL || 'http://localhost:8000';
    
    try {
      const baseUrl = aiEngineUrl.replace(/\/+$/, '');
      const aiResponse = await withRetry(() => fetchWithTimeout(`${baseUrl}/review-diff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.REPOSAGE_API_KEY || '' },
        body: JSON.stringify({ files: filesToReview })
      }, REVIEW_DIFF_TIMEOUT_MS), 1);

      if (aiResponse.ok) {
        let result;
        try {
          result = await aiResponse.json();
        } catch (parseErr) {
          console.warn(`[${requestId}] ΓÜá∩╕Å AI engine returned HTTP 200 with malformed (non-JSON) body:`, parseErr.message);
        }
        if (result && Array.isArray(result.comments)) {
          result.comments.forEach(c => {
            const validLines = validChangedLines.get(c.path);
            if (!validLines || !validLines.has(Number(c.line))) {
              console.warn(`[${requestId}] ΓÜá∩╕Å Skipping invalid inline comment location ${c.path}:${c.line}`);
              aiCommentsDiscarded++;
              return;
            }
            // Avoid duplicate comments if secrets scanner already flagged it
            const duplicate = commentsToPost.some(exist => exist.path === c.path && exist.line === c.line);
            if (!duplicate) {
              commentsToPost.push({
                path: c.path,
                line: c.line,
                body: `<!-- RepoSage Review Comment -->\n${escapeHtml(String(c.body || c.comment || ''))}`
              });
            }
          });
          if (aiCommentsDiscarded > 0) {
            console.warn(`[${requestId}] ΓÜá∩╕Å ${aiCommentsDiscarded} AI comments could not be posted due to line number mismatches with the diff`);
          }
          aiEngineQueried = true;
          if (result && result.truncated) {
            reviewDiffTruncated = true;
            console.warn(`[${requestId}] ⚠️ AI engine review-diff was truncated: ${result.warning || (result.files_reviewed + ' of ' + result.files_total + ' files reviewed')}`);
          }
        } else {
          console.warn(`[${requestId}] ΓÜá∩╕Å AI engine returned HTTP 200 with empty or malformed response body ΓÇö not treating as a clean analysis`);
        }
      } else if (aiResponse.status === 401) {
        console.error(`[${requestId}] ≡ƒÜ¿ AI Engine rejected authentication. Check REPOSAGE_API_KEY in backend/.env`);
        throw new Error('AI Engine authentication failed');
      }
    } catch (err) {
      if (err.message === 'AI Engine authentication failed') {
        throw err;
      }
      console.warn(`[${requestId}] ΓÜá∩╕Å FastAPI AI Engine error, posting local scans only:`, err.message);
    }
  }

  // 3. Post consolidated review comment back to GitHub PR
  if (commentsToPost.length > 0) {
    console.log(`[${requestId}] Γ£ì∩╕Å Posting PR Review with ${commentsToPost.length} inline comments...`);

    // Batch comments to respect GitHub's limits (50 per review for Checks API alignment)
    const COMMENTS_PER_BATCH = 50;
    const commentBatches = [];
    for (let i = 0; i < commentsToPost.length; i += COMMENTS_PER_BATCH) {
      commentBatches.push(commentsToPost.slice(i, i + COMMENTS_PER_BATCH));
    }

    for (let batchIdx = 0; batchIdx < commentBatches.length; batchIdx++) {
      const batch = commentBatches[batchIdx];
      let body = `## ≡ƒ¢í∩╕Å RepoSage AI Code Review Audit Completed!\n\n`;
      if (commentBatches.length > 1) {
        body += `**Part ${batchIdx + 1} of ${commentBatches.length}** ΓÇö Showing ${batch.length} of ${commentsToPost.length} findings.\n\n`;
      }
      if (!aiEngineQueried && filesToReview.length > 0 && batchIdx === 0) {
        body += `ΓÜá∩╕Å **Limited Review:** The AI engine was unreachable or returned an unexpected response during this review. Only regex-based secret scanning was performed. AI-powered bug/performance/style analysis was skipped. Please ensure the AI Engine service is running correctly and re-trigger the review for a complete audit.\n\n`;
      }
      body += `I have audited the code changes in this Pull Request and generated **${commentsToPost.length} actionable inline suggestion${commentsToPost.length === 1 ? '' : 's'}**.\n\nPlease review my feedback and suggestions below. Happy coding! ≡ƒÜÇ`;

      // Wrap review creation so a single malformed/stale inline comment does
      // not abort the entire PR review. On failure, retry each comment
      // individually and skip any that GitHub rejects.
      try {
        const { data: createdReview } = await octokit.rest.pulls.createReview({
          owner,
          repo,
          pull_number: pullNumber,
          commit_id: headSha,
          event: 'COMMENT',
          body,
          comments: batch
        });
        postedReviewIds.push(createdReview.id);
      } catch (reviewErr) {
        console.warn(`[${requestId}] ⚠️ Batched review creation failed (${reviewErr.message}); retrying comments individually and skipping invalid ones.`);
        for (const comment of batch) {
          try {
            const { data: singleReview } = await octokit.rest.pulls.createReview({
              owner,
              repo,
              pull_number: pullNumber,
              commit_id: headSha,
              event: 'COMMENT',
              body: `## 🛡️ RepoSage AI Code Review Audit Completed!\n\n${body}`,
              comments: [comment]
            });
            postedReviewIds.push(singleReview.id);
          } catch (commentErr) {
            console.warn(`[${requestId}] ⚠️ Skipping invalid inline comment on ${comment.path}:${comment.line} — ${commentErr.message}`);
          }
        }
      }
    }
  } else if (aiCommentsDiscarded > 0) {
    console.warn(`[${requestId}] ΓÜá∩╕Å ${aiCommentsDiscarded} AI comments were discarded due to line number mismatches ΓÇö posting COMMENT review instead of approving.`);
    const { data: createdReview } = await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      commit_id: headSha,
      event: 'COMMENT',
      body: `## ΓÜá∩╕Å RepoSage AI Code Review ΓÇö Incomplete Review

The AI engine identified **${aiCommentsDiscarded} potential issue(s)** but could not determine exact line positions within the diff. These comments were filtered out to avoid inaccurate inline annotations.

**Action required:** Please manually review the changes for issues the AI may have detected. Re-run the review after pushing additional changes to re-evaluate.`
    });
    postedReviewIds.push(createdReview.id);
  } else if (!aiEngineQueried) {
    console.error(`[${requestId}] Γ¥î AI Engine was unreachable or returned an empty/malformed response ΓÇö posting COMMENT review instead of auto-approving.`);
    const { data: createdReview } = await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      commit_id: headSha,
      event: 'COMMENT',
      body: `## ΓÜá∩╕Å RepoSage AI Code Review ΓÇö AI Engine Issue

The AI engine could not be reached or returned an unexpected response during this review. The secrets scanner found **0 issues**, but the PR was **not** fully reviewed by the AI.

      Please ensure the AI Engine service is running correctly and re-trigger the review for a complete analysis.`
    });
    postedReviewIds.push(createdReview.id);
  } else if (reviewDiffTruncated) {
    console.warn(`[${requestId}] ⚠️ PR diff was truncated during review — posting COMMENT review instead of approving to avoid a false approval on un-reviewed files.`);
    const { data: createdReview } = await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      commit_id: headSha,
      event: 'COMMENT',
      body: `## ⚠️ RepoSage AI Code Review — Partial Review

The PR diff was too large to fully review by the AI engine. Some files were **not** analyzed, so this PR was **not** approved automatically.

**Action required:** Please manually review the remaining files, or split this PR into smaller changes for a complete automated review.`
    });
    postedReviewIds.push(createdReview.id);
  } else {
    console.log(`[${requestId}] ≡ƒÄë No code issues or recommendations found. Adding label and posting approval...`);

    try {
      await octokit.rest.issues.addLabels({
        owner,
        repo,
        issue_number: pullNumber,
        labels: ['gssoc:approved']
      });
      console.log(`[${requestId}] Γ£à Added gssoc:approved label to PR`);
    } catch (err) {
      console.warn(`[${requestId}] ΓÜá∩╕Å Could not add gssoc:approved label:`, err.message);
    }

    console.log(`[${requestId}] ≡ƒÄë No code issues or recommendations found. Posting approval review...`);
    const { data: createdReview } = await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      commit_id: headSha,
      event: 'APPROVE',
      body: `## ≡ƒ¢í∩╕Å RepoSage AI Code Review Audit Completed!\n\n≡ƒÄë Outstanding work! I have scanned the PR and found **0 issues**. Your changes look pristine, clean, and optimized! Approved! ≡ƒÜÇ`
    });
    postedReviewIds.push(createdReview.id);
  }

  if (redisClient && postedReviewIds.length > 0) {
    await storeReviewIds(redisClient, owner, repo, pullNumber, postedReviewIds);
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
  if (str.length === 0) return 'untitled_repo';
  return str;
}

// ≡ƒƒó Route: Export Review Report to HTML
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

  const readmeSection = analysis.generatedReadme ? `
    <h2 style="margin-top: 30px; color: #a855f7;">≡ƒôû Generated README</h2>
    <div style="background: rgba(0,0,0,0.2); border-radius: 8px; padding: 20px; margin-top: 10px; color: #e2e8f0; line-height: 1.7; font-size: 13px; white-space: pre-wrap;">${escapeHtml(analysis.generatedReadme)}</div>
  ` : '';

  const mermaidSection = analysis.mermaidDiagram ? `
    <h2 style="margin-top: 30px; color: #a855f7;">≡ƒôè Repository Structure Diagram</h2>
    <div style="background: rgba(0,0,0,0.2); border-radius: 8px; padding: 20px; margin-top: 10px; font-family: monospace; color: #c084fc; font-size: 12px; white-space: pre-wrap; overflow-x: auto;">${escapeHtml(analysis.mermaidDiagram)}</div>
  ` : '';

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
        h2 {
          border-bottom: 1px solid rgba(168,85,247,0.15);
          padding-bottom: 8px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>≡ƒ¢í∩╕Å RepoSage AI Code Audit Report</h1>
        <div class="meta">
          <strong>Repository Name:</strong> ${escapeHtml(repoName)}<br>
          <strong>Report Timestamp:</strong> ${new Date().toLocaleString()}<br>
          <strong>Audited with:</strong> RepoSage GSSoC '26 Audit Engine
        </div>
        ${readmeSection}
        ${mermaidSection}
        <h2 style="margin-top: 30px; color: #a855f7;">≡ƒöì Findings</h2>
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
            ${fileRows || '<tr><td colspan="6" style="text-align:center;">≡ƒÄë No issues found! Your codebase is clean.</td></tr>'}
          </tbody>
        </table>
        <div style="margin-top: 30px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 15px;">
          RepoSage AI ┬⌐ 2026. Made with ≡ƒÆ£ for GirlScript Summer of Code (GSSoC).
        </div>
      </div>
    </body>
    </html>
  `;
  
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeRepoName}_AUDIT_REPORT.html"`);
  return res.send(html);
});

// ≡ƒƒó Route: Export Review Report to PDF
app.post('/api/reports/pdf', requireApiKey, pdfExportLimiter, (req, res) => {
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

// ≡ƒƒó Route: Analytics Trends ΓÇö 30-day time-series of repository health scores
app.get('/api/analytics/trends', requireApiKey, async (req, res) => {
  try {
    await ensureConnection();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const matchFilter = {
      analyzedAt: { $gte: thirtyDaysAgo },
    };

    if (req.query.sessionId && typeof req.query.sessionId === 'string') {
      if (!isValidUuid(req.query.sessionId)) {
        return res.status(400).json({ error: 'Invalid sessionId parameter format.' });
      }
      matchFilter.sessionId = req.query.sessionId;
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
    console.error('Γ¥î Analytics Trends Error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve analytics trends.' });
  }
});

app.get("/api/review-history", requireApiKey, async (req, res) => {

    try {
        await ensureConnection();
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.per_page) || parseInt(req.query.limit) || 20));
        const skip = (page - 1) * limit;

        const sortField = req.query.sort === 'repoName' ? 'repoName' : 'analyzedAt';
        const sortDir = req.query.order === 'asc' ? 1 : -1;
        const [history, total] = await Promise.all([
          Analytics.find()
            .sort({ [sortField]: sortDir })
            .skip(skip)
            .limit(limit)
            .lean(),
          Analytics.countDocuments({})
        ]);

        res.json({
          success: true,
          history,
          pagination: { page, per_page: limit, limit, total, totalPages: Math.ceil(total / limit) }
        });

    } catch (err) {

        res.status(500).json({
            error: "Failed to fetch review history."
        });

    }

});

app.get("/api/review-history/:repo", requireApiKey, async (req, res) => {

    try {
        await ensureConnection();
        const repo = req.params.repo;
        if (typeof repo !== 'string' || repo.length === 0 || !/^[a-zA-Z0-9._-]+$/.test(repo)) {
          return res.status(400).json({ error: 'Invalid repo parameter.' });
        }

        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.per_page) || parseInt(req.query.limit) || 20));
        const skip = (page - 1) * limit;

        const sortField = req.query.sort === 'repoName' ? 'repoName' : 'analyzedAt';
        const sortDir = req.query.order === 'asc' ? 1 : -1;
        const [history, total] = await Promise.all([
          Analytics.find({ repoName: repo })
            .sort({ [sortField]: sortDir })
            .skip(skip)
            .limit(limit)
            .lean(),
          Analytics.countDocuments({ repoName: repo })
        ]);

        res.json({
          success: true,
          history,
          pagination: { page, per_page: limit, limit, total, totalPages: Math.ceil(total / limit) }
        });

    } catch (err) {

        res.status(500).json({
            error: "Failed to fetch repository history."
        });

    }

});

app.get("/api/review-history/compare/:id1/:id2", requireApiKey, async (req, res) => {

    try {
        await ensureConnection();
        if (!mongoose.Types.ObjectId.isValid(req.params.id1) || !mongoose.Types.ObjectId.isValid(req.params.id2)) {
          return res.status(400).json({ error: 'Invalid ID format.' });
        }

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

app.get('/health', (req, res) => {
  if (!serverReady) {
    return res.status(503).json({
      status: 'starting_up',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - serverStartTime.getTime()) / 1000),
      database: isDatabaseConnected() ? 'connected' : 'disconnected',
      message: 'Server is still initializing. Please retry shortly.',
    });
  }
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - serverStartTime.getTime()) / 1000),
    database: isDatabaseConnected() ? 'connected' : 'disconnected',
    mode: isDatabaseConnected() ? 'full' : 'degraded',
    circuitBreaker: reviewQueue.getCircuitState(),
    cacheEntries: analysisCache.getStats().size,
  });
});

app.get('/api/health/circuit-breaker', (req, res) => {
  res.json({
    ...reviewQueue.getCircuitState(),
    timestamp: new Date().toISOString(),
  });
});

// Webhook delivery stats endpoint (#2457)
app.get('/api/webhook/stats', (req, res) => {
  const avgDuration = webhookStats.totalDeliveries > 0
    ? Math.round(webhookStats.totalDurationMs / webhookStats.totalDeliveries)
    : 0;
  const uptimeMs = Date.now() - webhookStats.startedAt;
  res.json({
    ...webhookStats,
    avgDurationMs: avgDuration,
    uptimeMs,
    minDurationMs: webhookStats.minDurationMs === Infinity ? 0 : webhookStats.minDurationMs,
  });
});

// Sanitize error messages that may contain API keys, sensitive tokens, or internal file paths.
const SANITIZE_PATTERNS = [
  { pattern: /(?:sk-|gsk_|api[_-]?key|apikey|token|secret|password|auth)[\s=:"']+[^\s"']{8,}/gi, replacement: '***' },
  { pattern: /[A-Za-z0-9_-]{32,}/g, replacement: '***' },
  { pattern: /\/Users\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.\-\/]+)*/g, replacement: '[internal-path]' },
  { pattern: /\/home\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.\-\/]+)*/g, replacement: '[internal-path]' },
  { pattern: /\/var\/[A-Za-z0-9_.\-\/]+/g, replacement: '[internal-path]' },
  { pattern: /\/tmp\/[A-Za-z0-9_.\-\/]+/g, replacement: '[tmp-path]' },
  { pattern: /\/private\/var\/[A-Za-z0-9_.\-\/]+/g, replacement: '[internal-path]' },
  { pattern: /\/root\/[A-Za-z0-9_.\-\/]*/g, replacement: '[internal-path]' },
];

function fullyDecode(str) {
  let prev = str;
  let current = str;
  while (current !== prev) {
    prev = current;
    try { current = decodeURIComponent(prev); } catch { break; }
  }
  return current;
}

function sanitizeErrorMessage(msg) {
  if (!msg || typeof msg !== 'string') return msg;
  let sanitized = msg;
  for (const { pattern, replacement } of SANITIZE_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  try {
    const decoded = fullyDecode(sanitized);
    if (decoded !== sanitized) {
      let reSanitized = decoded;
      for (const { pattern, replacement } of SANITIZE_PATTERNS) {
        reSanitized = reSanitized.replace(pattern, replacement);
      }
      sanitized = reSanitized;
    }
  } catch { /* keep as-is */ }
  return sanitized;
}

function extractErrorMessage(err) {
  const msg = typeof err === 'string' ? err : (err && err.message) || 'Unknown error';
  return msg.split('\n')[0].trim();
}

const errorHandler = (err, req, res, next) => {
  const requestId = req.requestId || 'unknown';
  const repoUrl = req.repoUrl || req.body?.repoUrl || 'unknown';
  const safeMessage = sanitizeErrorMessage(extractErrorMessage(err));
  console.error(`[${requestId}] [repo=${repoUrl}] Unhandled error in request:`, safeMessage);
  if (err.stack) {
    console.error(`[${requestId}] [repo=${repoUrl}]`, err.stack);
  }
  if (res.headersSent) {
    return next(err);
  }
  const statusCode = err.statusCode || err.status || 500;
  res.status(statusCode).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : safeMessage,
  });
};
app.use(errorHandler);

async function startServer() {
  // Restore analysis cache from disk snapshot, then start periodic persistence
  await analysisCache.restoreFromDisk();
  analysisCache.startPersistTimer(parseInt(process.env.CACHE_PERSIST_INTERVAL_MS || '300000', 10));

  // Restore rate limiter state from disk
  restoreRateLimiterState();

  // Persist in-memory CSRF token stores on shutdown
  function persistCsrfTokens() {
    try {
      const csrfDir = path.join(__dirname, 'data');
      if (!fs.existsSync(csrfDir)) fs.mkdirSync(csrfDir, { recursive: true });
      const now = Date.now();
      const validTokens = [];
      for (const [token, expiry] of csrfTokenStore) {
        if (now <= expiry) validTokens.push({ token, expiry });
      }
      for (const [token, expiry] of csrfGraceTokenStore) {
        if (now <= expiry) validTokens.push({ token, expiry, grace: true });
      }
      fs.writeFileSync(path.join(csrfDir, 'csrf_tokens.json'), JSON.stringify(validTokens));
    } catch (err) {
      console.warn('⚠️ CSRF token persist failed:', err.message);
    }
  }

  // Periodic CSRF token persistence (every 2 minutes)
  const csrfPersistTimer = setInterval(persistCsrfTokens, 120000);
  csrfPersistTimer.unref();

  // Periodic rate limiter state persistence (every 2 minutes)
  const rateLimiterPersistTimer = setInterval(persistRateLimiterState, 120000);
  rateLimiterPersistTimer.unref();

  // Restore CSRF tokens from disk
  try {
    const csrfPath = path.join(__dirname, 'data', 'csrf_tokens.json');
    if (fs.existsSync(csrfPath)) {
      const raw = fs.readFileSync(csrfPath, 'utf-8');
      const tokens = JSON.parse(raw);
      const now = Date.now();
      for (const t of tokens) {
        if (now > t.expiry) continue;
        if (t.grace) {
          csrfGraceTokenStore.set(t.token, t.expiry);
        } else {
          csrfTokenStore.set(t.token, t.expiry);
        }
      }
      console.log(`📂 Restored ${tokens.length} CSRF tokens from disk`);
    }
  } catch (err) {
    console.warn('⚠️ CSRF token restore failed:', err.message);
  }

  // Persist in-memory state on shutdown
  async function persistAllState() {
    await analysisCache.persistToDisk();
    persistCsrfTokens();
    persistRateLimiterState();
  }
  const origCleanupTimers = cleanupTimers;
  cleanupTimers = function() {
    persistAllState();
    if (origCleanupTimers) origCleanupTimers();
    clearInterval(csrfPersistTimer);
    clearInterval(rateLimiterPersistTimer);
  };
  process.removeListener('SIGINT', onShutdown);
  process.removeListener('SIGTERM', onShutdown);
  process.on('SIGINT', () => { persistAllState(); onShutdown('SIGINT'); });
  process.on('SIGTERM', () => { persistAllState(); onShutdown('SIGTERM'); });

  await connectDatabase();
  if (!isDatabaseConnected()) {
    console.log('Server started in degraded mode (no database). Analytics will use file-based storage.');
  }
  serverReady = true;
  httpServer = app.listen(PORT, () => {
    console.log(`≡ƒƒó RepoSage Backend running on http://localhost:${PORT}`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Γ¥î Port ${PORT} is already in use. Please free the port or set PORT env variable.`);
      process.exit(1);
    }
    console.error(`Γ¥î Server failed to start: ${err.message}`);
    process.exit(1);
  });
}

startServer();
// TODO: Issue #397 - Bug [Backend]: Temp folder leakage if Node process crashes during analysis
