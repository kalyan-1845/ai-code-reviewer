import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Unit tests for the webhook review posting budget in backend/index.js.
// Covers the hard per-review comment cap, the per-PR exponential-backoff
// posting throttle, and the per-repository /ai-review manual trigger limit.
// The helpers below mirror the inlined logic in backend/index.js.
// ---------------------------------------------------------------------------

// Mirrors MAX_COMMENTS_PER_REVIEW in backend/index.js.
const MAX_COMMENTS_PER_REVIEW = 50;

// Mirrors the per-PR posting throttle in backend/index.js.
const POSTING_BACKOFF_BASE_MS = 30 * 1000;
const POSTING_BACKOFF_MAX_MS = 30 * 60 * 1000;
const prPostingState = new Map();

function isPrPostingBlocked(prKey, now = Date.now()) {
  const state = prPostingState.get(prKey);
  return !!(state && state.nextAllowedAt > now);
}

function recordPrPostingAttempt(prKey, failed, now = Date.now()) {
  if (!failed) {
    prPostingState.delete(prKey);
    return;
  }
  const state = prPostingState.get(prKey) || { backoffMs: 0 };
  const nextBackoff = Math.min(
    POSTING_BACKOFF_MAX_MS,
    Math.max(POSTING_BACKOFF_BASE_MS, state.backoffMs * 2 || POSTING_BACKOFF_BASE_MS)
  );
  prPostingState.set(prKey, { nextAllowedAt: now + nextBackoff, backoffMs: nextBackoff });
}

// Mirrors the /ai-review manual trigger limit in backend/index.js.
const MANUAL_TRIGGER_WINDOW_MS = 60 * 60 * 1000;
const MANUAL_TRIGGER_MAX = 3;
const manualTriggerCounts = new Map();

function consumeManualTrigger(owner, repo) {
  const now = Date.now();
  const key = `${owner}/${repo}`;
  const entry = manualTriggerCounts.get(key);
  if (!entry || now - entry.windowStart >= MANUAL_TRIGGER_WINDOW_MS) {
    manualTriggerCounts.set(key, { windowStart: now, count: 1 });
    return true;
  }
  if (entry.count >= MANUAL_TRIGGER_MAX) {
    return false;
  }
  entry.count += 1;
  return true;
}

function applyCommentCap(comments) {
  if (comments.length > MAX_COMMENTS_PER_REVIEW) {
    comments.length = MAX_COMMENTS_PER_REVIEW;
  }
  return comments;
}

test('comment collection is capped at MAX_COMMENTS_PER_REVIEW', () => {
  const comments = Array.from({ length: 200 }, (_, i) => ({ path: 'a.js', line: i + 1 }));
  const capped = applyCommentCap(comments);
  assert.equal(capped.length, MAX_COMMENTS_PER_REVIEW);
});

test('comment collection under the cap is unchanged', () => {
  const comments = Array.from({ length: 7 }, (_, i) => ({ path: 'a.js', line: i + 1 }));
  const capped = applyCommentCap(comments);
  assert.equal(capped.length, 7);
});

test('posting is not blocked before any failed attempt', () => {
  assert.equal(isPrPostingBlocked('acme/app#42'), false);
});

test('a failed posting attempt blocks the next attempt', () => {
  const prKey = 'acme/app#43';
  recordPrPostingAttempt(prKey, true, 1_000_000);
  assert.equal(isPrPostingBlocked(prKey, 1_000_000 + 5_000), true);
  assert.equal(isPrPostingBlocked(prKey, 1_000_000 + 10_000_000), false);
  prPostingState.delete(prKey);
});

test('backoff grows exponentially on consecutive failures', () => {
  const prKey = 'acme/app#44';
  recordPrPostingAttempt(prKey, true, 1_000_000);
  const firstUnblock = prPostingState.get(prKey).nextAllowedAt;
  recordPrPostingAttempt(prKey, true, 2_000_000);
  const secondUnblock = prPostingState.get(prKey).nextAllowedAt;
  assert.ok(secondUnblock - 2_000_000 >= firstUnblock - 1_000_000, 'backoff should not shrink');
  assert.ok(secondUnblock > firstUnblock, 'backoff should grow');
  prPostingState.delete(prKey);
});

test('a successful posting attempt clears the backoff', () => {
  const prKey = 'acme/app#45';
  recordPrPostingAttempt(prKey, true, 1_000_000);
  assert.equal(isPrPostingBlocked(prKey, 1_000_000 + 1_000), true);
  recordPrPostingAttempt(prKey, false, 1_000_000 + 2_000);
  assert.equal(isPrPostingBlocked(prKey, 1_000_000 + 2_000), false);
  prPostingState.delete(prKey);
});

test('manual /ai-review trigger allows up to MANUAL_TRIGGER_MAX per repo', () => {
  for (let i = 0; i < MANUAL_TRIGGER_MAX; i += 1) {
    assert.equal(consumeManualTrigger('acme', 'app'), true);
  }
  assert.equal(consumeManualTrigger('acme', 'app'), false);
  manualTriggerCounts.delete('acme/app');
});

test('manual trigger limit is enforced per repository', () => {
  for (let i = 0; i < MANUAL_TRIGGER_MAX; i += 1) {
    consumeManualTrigger('repoa', 'one');
  }
  assert.equal(consumeManualTrigger('repoa', 'one'), false);
  assert.equal(consumeManualTrigger('repob', 'two'), true);
  manualTriggerCounts.delete('repoa/one');
  manualTriggerCounts.delete('repob/two');
});
