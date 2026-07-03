import crypto from 'crypto';
import { Octokit } from '@octokit/rest';
import Redis from 'ioredis';
import AnalysisCache from '../utils/analysisCache.js';
import ReviewQueue from '../utils/reviewQueue.js';

const ANALYSIS_CACHE_TTL_MS = ((n) => Number.isFinite(n) && n > 0 ? n : 60)(parseInt(process.env.ANALYSIS_CACHE_TTL_MINUTES || '60', 10)) * 60 * 1000;
export const analysisCache = new AnalysisCache(ANALYSIS_CACHE_TTL_MS);

export const reviewQueue = new ReviewQueue();

export const octokit = new Octokit({ auth: process.env.GITHUB_PAT || undefined });

export let redisClient;
if (process.env.REDIS_URL) {
  redisClient = new Redis(process.env.REDIS_URL);
  redisClient.on('error', (err) => console.error('Redis Client Error', err));
}

export const CSRF_COOKIE_NAME = 'csrf-token';
export const CSRF_TOKEN_TTL_MS = 30 * 60 * 1000;
export const CSRF_ROTATION_GRACE_MS = 10 * 1000;
export const csrfTokenStore = new Map();
export const csrfGraceTokenStore = new Map();

export function generateCsrfToken() {
  const token = crypto.randomBytes(32).toString('hex');
  csrfTokenStore.set(token, Date.now() + CSRF_TOKEN_TTL_MS);
  if (csrfTokenStore.size > 10000) {
    const now = Date.now();
    for (const [t, expiry] of csrfTokenStore) {
      if (now > expiry) csrfTokenStore.delete(t);
    }
    while (csrfTokenStore.size > 10000) {
      const oldest = csrfTokenStore.keys().next();
      if (oldest.done) break;
      csrfTokenStore.delete(oldest.value);
    }
  }
  return token;
}

export function validateCsrfToken(token) {
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

export async function fetchWithTimeout(url, options = {}, timeoutMs = 120000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const ALLOWED_ANALYSIS_MODELS = ["llama-3.3-70b-versatile", "deepseek-r1-distill-llama-70b", "llama-3.1-8b-instant", "gemma2-9b-it"];

export const DELIVERY_REDIS_TTL = 300;

export function sanitizeFilename(repoName) {
  let str = String(repoName);
  try { str = decodeURIComponent(str); } catch { /* keep original */ }
  str = str.normalize('NFKC');
  str = str.replace(/\0/g, '');
  str = str.replace(/[/\\]+/g, '/').replace(/\.\.\/|\.\\/g, '');
  str = str.replace(/\.\.+/g, '_').replace(/(?:^|\/)[.]+(?=\/|$)/g, '_');
  str = str.replace(/[^\w.-]+/g, '_');
  return str;
}

export const REPO_WINDOW_MS = 60 * 1000;
export const REPO_MAX_REQUESTS = 5;
export const repoRequestCounts = new Map();

export const EXCLUSIVE_LOCK_CLEANUP_INTERVAL = 5 * 60 * 1000;
export const EXCLUSIVE_LOCK_TTL = 30 * 60 * 1000;

import { DANGEROUS_PHRASES } from '../shared/dangerousPhrases.js';

const HOMOGLYPH_MAP = {
  '\u0430': 'a', '\u0435': 'e', '\u043E': 'o', '\u0441': 'c', '\u0440': 'p',
  '\u0445': 'x', '\u0443': 'y', '\u0432': 'b', '\u043D': 'h', '\u043A': 'k',
  '\u043C': 'm', '\u0438': 'i',
  '\u0410': 'A', '\u0412': 'B', '\u0415': 'E', '\u0421': 'C', '\u041D': 'H',
  '\u041A': 'K', '\u041C': 'M', '\u041E': 'O', '\u0420': 'P', '\u0423': 'Y',
  '\u0425': 'X',
  '\u0428': 'W',
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

export function validatePrompt(prompt) {
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

export function requireJsonContentType(req, res, next) {
  if (!req.is('application/json')) {
    return res.status(415).json({ error: 'Content-Type must be application/json' });
  }
  next();
}
