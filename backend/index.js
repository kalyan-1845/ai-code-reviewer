import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { verifyPort } from './utils/envVerifier.js';
import { connectDatabase, closeDatabase } from './config/db.js';
import fs from 'fs';
import {
  generateCsrfToken, validateCsrfToken, csrfTokenStore, csrfGraceTokenStore,
  CSRF_COOKIE_NAME, CSRF_TOKEN_TTL_MS, CSRF_ROTATION_GRACE_MS,
  redisClient, EXCLUSIVE_LOCK_CLEANUP_INTERVAL, EXCLUSIVE_LOCK_TTL,
  reviewQueue
} from './routes/context.js';

import sessionRoutes from './routes/session.js';
import analyzeRoutes, { tempReposDir } from './routes/analyze.js';
import chatRoutes from './routes/chat.js';
import ragRoutes from './routes/rag.js';
import webhookRoutes from './routes/webhook.js';
import issuesRoutes from './routes/issues.js';
import cacheRoutes from './routes/cache.js';
import reportsRoutes from './routes/reports.js';
import analyticsRoutes from './routes/analytics.js';
import reviewHistoryRoutes from './routes/reviewHistory.js';

dotenv.config();

connectDatabase();

const app = express();
const PORT = verifyPort(process.env.PORT || 5000);

const trustProxy = process.env.TRUST_PROXY !== 'false';
if (trustProxy) {
  app.set('trust proxy', 1);
}

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173').split(',').map(s => s.trim());
app.use(cors({
  origin: ALLOWED_ORIGINS,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'x-api-key'],
  credentials: true
}));

app.use(cookieParser());

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

setInterval(() => {
  const now = Date.now();
  for (const [token, expiry] of csrfTokenStore) {
    if (now > expiry) csrfTokenStore.delete(token);
  }
  for (const [token, expiry] of csrfGraceTokenStore) {
    if (now > expiry) csrfGraceTokenStore.delete(token);
  }
}, 5 * 60 * 1000);

function csrfProtection(req, res, next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const headerToken = req.headers['x-csrf-token'];
    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
    if (!headerToken || !cookieToken) {
      if (req.path === '/api/session' || req.path === '/api/csrf-token') {
        return next();
      }
      if (req.path === '/api/webhook') {
        return next();
      }
      return res.status(403).json({ error: 'CSRF validation failed.' });
    }
    const headerBuf = Buffer.from(String(headerToken));
    const cookieBuf = Buffer.from(String(cookieToken));
    if (headerBuf.length !== cookieBuf.length || !crypto.timingSafeEqual(headerBuf, cookieBuf)) {
      if (req.path === '/api/session' || req.path === '/api/csrf-token') {
        return next();
      }
      if (req.path === '/api/webhook') {
        return next();
      }
      return res.status(403).json({ error: 'CSRF validation failed.' });
    }
    if (!validateCsrfToken(headerToken)) {
      return res.status(403).json({ error: 'CSRF token expired. Refresh and try again.' });
    }
    if (csrfTokenStore.delete(headerToken)) {
      csrfGraceTokenStore.set(headerToken, Date.now() + CSRF_ROTATION_GRACE_MS);
    }
    const newToken = generateCsrfToken();
    res.cookie(CSRF_COOKIE_NAME, newToken, {
      sameSite: 'strict',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
    });
    res.locals.rotatedCsrfToken = newToken;
  }
  next();
}

app.use(csrfProtection);

// Mount all route modules
app.use(sessionRoutes);
app.use(analyzeRoutes);
app.use(chatRoutes);
app.use(ragRoutes);
app.use(webhookRoutes);
app.use(issuesRoutes);
app.use(cacheRoutes);
app.use(reportsRoutes);
app.use(analyticsRoutes);
app.use(reviewHistoryRoutes);

// Periodic cleanup for exclusive locks
const exclusiveLockCleanupTimer = setInterval(() => {
  reviewQueue.cleanupStaleExclusiveLocks(EXCLUSIVE_LOCK_TTL);
}, EXCLUSIVE_LOCK_CLEANUP_INTERVAL);

function cleanupTimers() {
  clearInterval(exclusiveLockCleanupTimer);
}

function cleanupTempRepos() {
  if (fs.existsSync(tempReposDir)) {
    fs.rmSync(tempReposDir, { recursive: true, force: true });
  }
}

function onShutdown() {
  cleanupTempRepos();
  cleanupTimers();
  if (redisClient) redisClient.quit();
  closeDatabase();
  process.exit(0);
}

process.on('SIGINT', onShutdown);
process.on('SIGTERM', onShutdown);

app.listen(PORT, () => {
  console.log(`🟢 RepoSage Backend running on http://localhost:${PORT}`);
});
