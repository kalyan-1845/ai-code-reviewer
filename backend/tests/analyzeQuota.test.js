import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Unit tests for the /api/analyze + /api/analyze-file per-caller daily budget
// and the per-analysis file-count cap (#3549).
//
// These mirror the inlined helpers in backend/index.js. The budget must be
// keyed on a STABLE per-caller identity (session-cookie uid when present,
// otherwise a hash of the caller's IP) so that an attacker cannot evade it by
// minting a fresh clientId per request.
// ---------------------------------------------------------------------------

const ANALYSIS_DAILY_BUDGET_PER_CLIENT = parseInt(process.env.ANALYSIS_DAILY_BUDGET_PER_CLIENT || '50', 10);
const ANALYSIS_DAILY_BUDGET_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_FILES_PER_ANALYSIS = parseInt(process.env.MAX_FILES_PER_ANALYSIS || '100', 10);
const dailyAnalysisBudgetMap = new Map();

function getAnalysisBudgetKey(req) {
  const hasSessionCookie = typeof req.headers?.cookie === 'string' && req.headers.cookie.includes('rps_v1_session');
  if (hasSessionCookie && req.clientId) {
    return req.clientId;
  }
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  return crypto.createHash('sha256').update(`daily-analysis:${ip}`).digest('hex');
}

function consumeDailyAnalysisBudget(req) {
  const key = getAnalysisBudgetKey(req);
  const now = Date.now();
  const entry = dailyAnalysisBudgetMap.get(key);
  if (!entry || now - entry.windowStart >= ANALYSIS_DAILY_BUDGET_WINDOW_MS) {
    dailyAnalysisBudgetMap.set(key, { windowStart: now, count: 1 });
    return { allowed: true, remaining: ANALYSIS_DAILY_BUDGET_PER_CLIENT - 1 };
  }
  if (entry.count >= ANALYSIS_DAILY_BUDGET_PER_CLIENT) {
    return { allowed: false, remaining: 0 };
  }
  entry.count += 1;
  return { allowed: true, remaining: ANALYSIS_DAILY_BUDGET_PER_CLIENT - entry.count };
}

function truncateFiles(files) {
  const truncatedFiles = [];
  const MAX_PAYLOAD_CHARS = 30000;
  let currentPayloadLength = 0;
  let partial = false;
  for (const file of files) {
    if (currentPayloadLength + file.content.length > MAX_PAYLOAD_CHARS || truncatedFiles.length >= MAX_FILES_PER_ANALYSIS) {
      partial = true;
      break;
    }
    truncatedFiles.push(file);
    currentPayloadLength += file.content.length;
  }
  return { files: truncatedFiles, partial };
}

function makeReq({ ip, cookie, clientId }) {
  return {
    headers: { ...(cookie ? { cookie } : {}) },
    ip,
    ...(clientId ? { clientId } : {}),
  };
}

test('budget: cookie-less callers are keyed on IP hash, stable across requests', () => {
  dailyAnalysisBudgetMap.clear();
  const reqA = makeReq({ ip: '203.0.113.10' });
  const reqB = makeReq({ ip: '203.0.113.10' });
  assert.equal(getAnalysisBudgetKey(reqA), getAnalysisBudgetKey(reqB), 'same IP must map to the same budget key');
  assert.ok(consumeDailyAnalysisBudget(reqA).allowed);
  assert.ok(consumeDailyAnalysisBudget(reqB).allowed);
  assert.equal(dailyAnalysisBudgetMap.size, 1, 'one key shared by both requests');
});

test('budget: different IPs get distinct budget keys', () => {
  dailyAnalysisBudgetMap.clear();
  const keyA = getAnalysisBudgetKey(makeReq({ ip: '203.0.113.1' }));
  const keyB = getAnalysisBudgetKey(makeReq({ ip: '203.0.113.2' }));
  assert.notEqual(keyA, keyB);
});

test('budget: session-cookie callers are keyed on their cookie uid, not IP', () => {
  dailyAnalysisBudgetMap.clear();
  const req = makeReq({ ip: '203.0.113.99', cookie: 'rps_v1_session=abc', clientId: 'user-1' });
  assert.equal(getAnalysisBudgetKey(req), 'user-1', 'cookie uid must take precedence over IP');
});

test('budget: budget key never depends on the X-Forwarded-For header', () => {
  // req.ip is the trust-proxy-resolved address; the raw header must not leak
  // into the key (an attacker would rotate it to get a fresh budget).
  const keyA = getAnalysisBudgetKey({ headers: { 'x-forwarded-for': '1.2.3.4' }, ip: '198.51.100.7' });
  const keyB = getAnalysisBudgetKey({ headers: { 'x-forwarded-for': '9.9.9.9' }, ip: '198.51.100.7' });
  assert.equal(keyA, keyB);
});

test('budget: enforcement denies once the per-caller cap is reached', () => {
  dailyAnalysisBudgetMap.clear();
  const req = makeReq({ ip: '203.0.113.50' });
  for (let i = 0; i < ANALYSIS_DAILY_BUDGET_PER_CLIENT; i++) {
    assert.equal(consumeDailyAnalysisBudget(req).allowed, true, `request ${i + 1} should be allowed`);
  }
  const denied = consumeDailyAnalysisBudget(req);
  assert.equal(denied.allowed, false, 'request beyond the cap must be denied');
  assert.equal(denied.remaining, 0);
});

test('budget: window resets after 24 hours', () => {
  dailyAnalysisBudgetMap.clear();
  const req = makeReq({ ip: '203.0.113.60' });
  const first = consumeDailyAnalysisBudget(req);
  // Simulate a request after the window has elapsed.
  const entry = dailyAnalysisBudgetMap.get(getAnalysisBudgetKey(req));
  entry.windowStart = entry.windowStart - ANALYSIS_DAILY_BUDGET_WINDOW_MS - 1;
  const next = consumeDailyAnalysisBudget(req);
  assert.equal(first.allowed, true);
  assert.equal(next.allowed, true, 'a new window must grant a fresh budget');
});

test('file cap: payload loop stops at MAX_FILES_PER_ANALYSIS even for tiny files', () => {
  const files = Array.from({ length: 500 }, (_, i) => ({ name: `f${i}.js`, content: 'x' }));
  const { files: kept, partial } = truncateFiles(files);
  assert.equal(kept.length, MAX_FILES_PER_ANALYSIS);
  assert.equal(partial, true);
});

test('file cap: small repos are not truncated', () => {
  const files = Array.from({ length: 5 }, (_, i) => ({ name: `f${i}.js`, content: 'let a = 1;' }));
  const { files: kept, partial } = truncateFiles(files);
  assert.equal(kept.length, 5);
  assert.equal(partial, false);
});
