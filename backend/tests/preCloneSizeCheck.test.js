import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Unit tests for the /api/analyze pre-clone repository size check (issue
 * #3672).
 *
 * The check must enforce MAX_REPO_SIZE_MB BEFORE cloning even when no
 * GITHUB_PAT is configured, by using GitHub's unauthenticated API. When the
 * anonymous lookup fails (rate-limited or non-GitHub repo), the handler falls
 * through to the clone-time blob budget and post-clone size check instead of
 * refusing.
 *
 * The decision logic below mirrors the route in backend/index.js.
 */
const MAX_SIZE_BYTES = 100 * 1024 * 1024;

async function preCloneSizeDecision({ hasPat, patVerify, anonVerify }) {
  if (hasPat) {
    try {
      const sizeBytes = await patVerify();
      return sizeBytes > MAX_SIZE_BYTES ? { action: 'reject-413' } : { action: 'clone' };
    } catch (err) {
      if (err.status === 403 || err.status === 429) {
        try {
          const sizeBytes = await anonVerify();
          return sizeBytes > MAX_SIZE_BYTES ? { action: 'reject-413' } : { action: 'clone' };
        } catch {
          return { action: 'reject-429' };
        }
      }
      return { action: 'reject-502' };
    }
  }
  // No GITHUB_PAT configured: still enforce the limit pre-clone via the
  // unauthenticated GitHub API. If the anonymous lookup fails, fall back to
  // clone-time enforcement rather than refusing.
  try {
    const sizeBytes = await anonVerify();
    return sizeBytes > MAX_SIZE_BYTES ? { action: 'reject-413' } : { action: 'clone' };
  } catch {
    return { action: 'clone' };
  }
}

const oversizedBytes = (200 * 1024 * 1024).toString();
const smallBytes = (10 * 1024 * 1024).toString();

test('without GITHUB_PAT an oversized repo is rejected BEFORE cloning (#3672)', async () => {
  const decision = await preCloneSizeDecision({
    hasPat: false,
    anonVerify: async () => oversizedBytes,
  });

  assert.equal(decision.action, 'reject-413',
    'the pre-clone size limit must be enforced even without GITHUB_PAT');
});

test('without GITHUB_PAT a small repo is allowed to clone', async () => {
  const decision = await preCloneSizeDecision({
    hasPat: false,
    anonVerify: async () => smallBytes,
  });

  assert.equal(decision.action, 'clone');
});

test('without GITHUB_PAT an anonymous API failure falls back to clone-time enforcement', async () => {
  const decision = await preCloneSizeDecision({
    hasPat: false,
    anonVerify: async () => { throw new Error('rate limited'); },
  });

  assert.equal(decision.action, 'clone',
    'a failed anonymous lookup must not block cloning; the post-clone check still applies');
});

test('with GITHUB_PAT an oversized repo is rejected before cloning', async () => {
  const decision = await preCloneSizeDecision({
    hasPat: true,
    patVerify: async () => oversizedBytes,
    anonVerify: async () => oversizedBytes,
  });

  assert.equal(decision.action, 'reject-413');
});

test('with GITHUB_PAT a rate-limited PAT retries anonymously before refusing', async () => {
  const decision = await preCloneSizeDecision({
    hasPat: true,
    patVerify: async () => { const e = new Error('rate limited'); e.status = 429; throw e; },
    anonVerify: async () => smallBytes,
  });

  assert.equal(decision.action, 'clone');
});

test('with GITHUB_PAT a rate-limited PAT with failing anonymous retry refuses 429', async () => {
  const decision = await preCloneSizeDecision({
    hasPat: true,
    patVerify: async () => { const e = new Error('rate limited'); e.status = 403; throw e; },
    anonVerify: async () => { throw new Error('rate limited'); },
  });

  assert.equal(decision.action, 'reject-429');
});
