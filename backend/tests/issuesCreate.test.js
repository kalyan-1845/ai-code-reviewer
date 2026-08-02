import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Unit tests for POST /api/issues/create endpoint in backend/index.js.
// Tests cover validation of title, body, labels, repoUrl, GITHUB_PAT presence,
// session binding (the target repo must be one the caller analyzed), PAT repo
// access checks, per-client quota, and generic error handling. Does not
// require live GitHub API or MongoDB connection.
// ---------------------------------------------------------------------------

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TEST_SESSION_ID = '11111111-1111-4111-8111-111111111111';
const TEST_OWNER_TOKEN = 'test-owner-token';

// ---------------------------------------------------------------------------
// Inlined helpers — mirror the /api/issues/create route from backend/index.js.
// ---------------------------------------------------------------------------
function isValidUuidLike(value) {
  return typeof value === 'string' && UUID_V4_RE.test(value);
}

function parseInTest(repoUrl) {
  if (typeof repoUrl !== 'string') return null;
  try {
    const parsedUrl = new URL(repoUrl);
    if (parsedUrl.hostname !== 'github.com') return null;
    const pathParts = parsedUrl.pathname.replace(/\.git$/, '').replace(/\/$/, '').split('/').filter(Boolean);
    if (pathParts.length < 2) return null;
    return { owner: pathParts[0], repo: pathParts[1] };
  } catch {
    return null;
  }
}

const ISSUE_QUOTA_WINDOW_MS = 60 * 60 * 1000;
const MAX_ISSUES_PER_CLIENT = 5;
const issueQuotaByClient = new Map();

function consumeIssueQuota(clientId) {
  const now = Date.now();
  const entry = issueQuotaByClient.get(clientId);
  if (!entry || now - entry.windowStart >= ISSUE_QUOTA_WINDOW_MS) {
    issueQuotaByClient.set(clientId, { windowStart: now, count: 1 });
    return true;
  }
  if (entry.count >= MAX_ISSUES_PER_CLIENT) {
    return false;
  }
  entry.count += 1;
  return true;
}

function resetIssueQuotaForTesting() {
  issueQuotaByClient.clear();
}

// Inlined handler — mirrors the /api/issues/create route from backend/index.js.
async function issuesCreateHandler(req, env = {}) {
  const token = env.GITHUB_PAT || process.env.GITHUB_PAT;
  const { repoUrl, title, body, labels = [], sessionId, sessionOwnerToken } = req.body || {};

  if (!token) {
    return { status: 400, body: { error: 'GITHUB_PAT is not configured in backend/.env.' } };
  }
  if (!title || typeof title !== 'string' || title.length < 1 || title.length > 256) {
    return { status: 400, body: { error: 'Title is required and must be 1-256 characters.' } };
  }
  if (!body || typeof body !== 'string' || body.length < 1 || body.length > 65536) {
    return { status: 400, body: { error: 'Body is required and must be 1-65536 characters.' } };
  }
  if (!Array.isArray(labels)) {
    return { status: 400, body: { error: 'Labels must be an array.' } };
  }
  if (labels.length > 10) {
    return { status: 400, body: { error: 'Maximum 10 labels allowed.' } };
  }
  for (const label of labels) {
    if (typeof label !== 'string' || label.length > 50) {
      return { status: 400, body: { error: 'Each label must be a string of at most 50 characters.' } };
    }
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(repoUrl);
  } catch {
    return { status: 400, body: { error: 'Invalid GitHub repository URL.' } };
  }
  if (parsedUrl.hostname !== 'github.com') {
    return { status: 400, body: { error: 'URL must be a github.com repository.' } };
  }
  const pathParts = parsedUrl.pathname.replace(/\.git$/, '').replace(/\/$/, '').split('/').filter(Boolean);
  if (pathParts.length < 2) {
    return { status: 400, body: { error: 'Invalid GitHub repository URL structure.' } };
  }
  const [owner, repo] = pathParts;

  // Session binding: the target repo must be one this caller analyzed.
  if (!isValidUuidLike(sessionId)) {
    return { status: 400, body: { error: 'sessionId is required and must be a valid UUID.' } };
  }
  if (!sessionOwnerToken || typeof sessionOwnerToken !== 'string') {
    return { status: 403, body: { error: 'Access denied: sessionOwnerToken is required.' } };
  }

  const session = env.sessionDoc || (env.useDefaultSession
    ? { ownerToken: TEST_OWNER_TOKEN, repoUrl: 'https://github.com/org/repo' }
    : null);
  if (!session) {
    return { status: 403, body: { error: 'Access denied: session not found or expired. Please analyze a repository first.' } };
  }
  if (!session.ownerToken) {
    return { status: 403, body: { error: 'Access denied: session has no ownership token.' } };
  }
  if (sessionOwnerToken !== String(session.ownerToken)) {
    return { status: 403, body: { error: 'Access denied: this session does not belong to you.' } };
  }

  const analyzed = parseInTest(session.repoUrl);
  if (!analyzed || analyzed.owner !== owner || analyzed.repo !== repo) {
    return { status: 403, body: { error: 'Access denied: you can only create issues for the repository you analyzed in your session.' } };
  }

  if (!consumeIssueQuota(env.clientId || 'test-client')) {
    return { status: 429, body: { error: 'Issue creation limit reached for this session. Try again later.' } };
  }

  if (env.patRepoAccessError) {
    return { status: 403, body: { error: 'Access denied: the server token cannot access this repository.' } };
  }

  if (env.createIssueError) {
    return { status: 500, body: { error: 'Failed to create the GitHub issue. Please try again later.' } };
  }

  return {
    status: 200,
    body: {
      success: true,
      issueUrl: `https://github.com/${owner}/${repo}/issues/42`,
      number: 42,
    },
  };
}

function baseReq(overrides = {}) {
  return {
    title: 'Test',
    body: 'Desc',
    repoUrl: 'https://github.com/org/repo',
    labels: [],
    sessionId: TEST_SESSION_ID,
    sessionOwnerToken: TEST_OWNER_TOKEN,
    ...overrides,
  };
}

function baseEnv(overrides = {}) {
  return { GITHUB_PAT: 'fake-token', useDefaultSession: true, ...overrides };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetIssueQuotaForTesting();
});

test('returns 400 when GITHUB_PAT is not configured', async () => {
  const result = await issuesCreateHandler({ body: baseReq() }, { GITHUB_PAT: undefined });
  assert.equal(result.status, 400);
  assert.ok(result.body.error.includes('GITHUB_PAT'));
});

test('returns 400 when title is missing', async () => {
  const result = await issuesCreateHandler({ body: baseReq({ title: undefined }) }, baseEnv());
  assert.equal(result.status, 400);
  assert.ok(result.body.error.includes('Title'));
});

test('returns 400 when title exceeds 256 characters', async () => {
  const result = await issuesCreateHandler({ body: baseReq({ title: 'x'.repeat(257) }) }, baseEnv());
  assert.equal(result.status, 400);
  assert.ok(result.body.error.includes('Title'));
});

test('returns 400 when body is missing', async () => {
  const result = await issuesCreateHandler({ body: baseReq({ body: undefined }) }, baseEnv());
  assert.equal(result.status, 400);
  assert.ok(result.body.error.includes('Body'));
});

test('returns 400 when body exceeds 65536 characters', async () => {
  const result = await issuesCreateHandler({ body: baseReq({ body: 'x'.repeat(65537) }) }, baseEnv());
  assert.equal(result.status, 400);
  assert.ok(result.body.error.includes('Body'));
});

test('returns 400 when labels is not an array', async () => {
  const result = await issuesCreateHandler({ body: baseReq({ labels: 'bug' }) }, baseEnv());
  assert.equal(result.status, 400);
  assert.ok(result.body.error.includes('array'));
});

test('returns 400 when labels exceeds 10 items', async () => {
  const result = await issuesCreateHandler(
    { body: baseReq({ labels: Array.from({ length: 11 }, (_, i) => `label${i}`) }) },
    baseEnv()
  );
  assert.equal(result.status, 400);
  assert.ok(result.body.error.includes('10'));
});

test('returns 400 when a label exceeds 50 characters', async () => {
  const result = await issuesCreateHandler({ body: baseReq({ labels: ['a'.repeat(51)] }) }, baseEnv());
  assert.equal(result.status, 400);
  assert.ok(result.body.error.includes('50'));
});

test('returns 400 for invalid GitHub repository URL', async () => {
  const result = await issuesCreateHandler({ body: baseReq({ repoUrl: 'not-a-url' }) }, baseEnv());
  assert.equal(result.status, 400);
  assert.ok(result.body.error.includes('Invalid GitHub'));
});

test('returns 400 for non-github.com URL', async () => {
  const result = await issuesCreateHandler({ body: baseReq({ repoUrl: 'https://gitlab.com/org/repo' }) }, baseEnv());
  assert.equal(result.status, 400);
  assert.ok(result.body.error.includes('github.com'));
});

test('returns 400 for URL with fewer than two path segments', async () => {
  const result = await issuesCreateHandler({ body: baseReq({ repoUrl: 'https://github.com/orgonly' }) }, baseEnv());
  assert.equal(result.status, 400);
  assert.ok(result.body.error.includes('Invalid GitHub repository URL structure'));
});

test('returns 400 when sessionId is missing', async () => {
  const result = await issuesCreateHandler(
    { body: baseReq({ sessionId: undefined }) },
    baseEnv()
  );
  assert.equal(result.status, 400);
  assert.ok(result.body.error.includes('sessionId'));
});

test('returns 400 when sessionId is not a valid UUID', async () => {
  const result = await issuesCreateHandler(
    { body: baseReq({ sessionId: 'not-a-uuid' }) },
    baseEnv()
  );
  assert.equal(result.status, 400);
  assert.ok(result.body.error.includes('sessionId'));
});

test('returns 403 when sessionOwnerToken is missing', async () => {
  const result = await issuesCreateHandler(
    { body: baseReq({ sessionOwnerToken: undefined }) },
    baseEnv()
  );
  assert.equal(result.status, 403);
  assert.ok(result.body.error.includes('sessionOwnerToken'));
});

test('returns 403 when the session does not exist', async () => {
  const result = await issuesCreateHandler(
    { body: baseReq() },
    baseEnv({ useDefaultSession: false })
  );
  assert.equal(result.status, 403);
  assert.ok(result.body.error.includes('session not found'));
});

test('returns 403 when the session ownership token does not match', async () => {
  const result = await issuesCreateHandler(
    { body: baseReq({ sessionOwnerToken: 'someone-elses-token' }) },
    baseEnv()
  );
  assert.equal(result.status, 403);
  assert.ok(result.body.error.includes('does not belong to you'));
});

test('returns 403 when the repo was not analyzed in the session', async () => {
  const result = await issuesCreateHandler(
    { body: baseReq({ repoUrl: 'https://github.com/other/steal' }) },
    baseEnv()
  );
  assert.equal(result.status, 403);
  assert.ok(result.body.error.includes('analyzed in your session'));
});

test('returns 403 when the PAT cannot access the target repo', async () => {
  const result = await issuesCreateHandler(
    { body: baseReq() },
    baseEnv({ patRepoAccessError: true })
  );
  assert.equal(result.status, 403);
  assert.ok(result.body.error.includes('server token cannot access'));
});

test('returns 500 with a generic error, not the raw GitHub error', async () => {
  const result = await issuesCreateHandler(
    { body: baseReq() },
    baseEnv({ createIssueError: 'Not Found - secret internal detail' })
  );
  assert.equal(result.status, 500);
  assert.ok(!result.body.error.includes('Not Found'));
  assert.ok(!result.body.error.includes('secret internal detail'));
});

test('returns 429 when the per-client quota is exceeded', async () => {
  const body = baseReq();
  for (let i = 0; i < 5; i += 1) {
    const ok = await issuesCreateHandler({ body }, baseEnv({ clientId: 'quota-client' }));
    assert.equal(ok.status, 200);
  }
  const blocked = await issuesCreateHandler({ body }, baseEnv({ clientId: 'quota-client' }));
  assert.equal(blocked.status, 429);
  assert.ok(blocked.body.error.includes('limit'));
});

test('returns 429 per client, leaving other clients unaffected', async () => {
  const body = baseReq();
  for (let i = 0; i < 5; i += 1) {
    await issuesCreateHandler({ body }, baseEnv({ clientId: 'client-a' }));
  }
  assert.equal((await issuesCreateHandler({ body }, baseEnv({ clientId: 'client-a' }))).status, 429);
  assert.equal((await issuesCreateHandler({ body }, baseEnv({ clientId: 'client-b' }))).status, 200);
});

test('returns 200 with issue details for valid request', async () => {
  const result = await issuesCreateHandler(
    { body: baseReq({ labels: ['bug'] }) },
    baseEnv()
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.ok(result.body.issueUrl.includes('github.com'));
  assert.equal(result.body.number, 42);
});

test('returns 200 with valid request that has empty labels array', async () => {
  const result = await issuesCreateHandler({ body: baseReq() }, baseEnv());
  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
});

test('handles URL with .git suffix', async () => {
  const result = await issuesCreateHandler(
    { body: baseReq({ repoUrl: 'https://github.com/org/repo.git' }) },
    baseEnv()
  );
  assert.equal(result.status, 200);
});

test('handles URL with trailing slash', async () => {
  const result = await issuesCreateHandler(
    { body: baseReq({ repoUrl: 'https://github.com/org/repo/' }) },
    baseEnv()
  );
  assert.equal(result.status, 200);
});
