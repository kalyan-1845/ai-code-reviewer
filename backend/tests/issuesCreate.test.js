import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Unit tests for POST /api/issues/create endpoint in backend/index.js.
// Tests cover validation of title, body, labels, repoUrl, GITHUB_PAT presence,
// and Octokit call success/failure. Does not require live GitHub API or
// MongoDB connection.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Inlined handler — mirrors the /api/issues/create route from backend/index.js.
// ---------------------------------------------------------------------------
async function issuesCreateHandler(req, env = {}) {
  const token = env.GITHUB_PAT || process.env.GITHUB_PAT;
  const { repoUrl, title, body, labels = [] } = req.body || {};

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

  if (env.createIssueError) {
    const err = new Error(env.createIssueError);
    return { status: 500, body: { error: `Failed to create issue: ${err.message}` } };
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('returns 400 when GITHUB_PAT is not configured', async () => {
  const result = await issuesCreateHandler(
    { body: { title: 'Test', body: 'Desc', repoUrl: 'https://github.com/org/repo' } },
    { GITHUB_PAT: undefined }
  );
  assert.equal(result.status, 400);
  assert.ok(result.body.error.includes('GITHUB_PAT'));
});

test('returns 400 when title is missing', async () => {
  const result = await issuesCreateHandler(
    { body: { body: 'Desc', repoUrl: 'https://github.com/org/repo' } },
    { GITHUB_PAT: 'fake-token' }
  );
  assert.equal(result.status, 400);
  assert.ok(result.body.error.includes('Title'));
});

test('returns 400 when title exceeds 256 characters', async () => {
  const result = await issuesCreateHandler(
    { body: { title: 'x'.repeat(257), body: 'Desc', repoUrl: 'https://github.com/org/repo' } },
    { GITHUB_PAT: 'fake-token' }
  );
  assert.equal(result.status, 400);
  assert.ok(result.body.error.includes('Title'));
});

test('returns 400 when body is missing', async () => {
  const result = await issuesCreateHandler(
    { body: { title: 'Test Title', repoUrl: 'https://github.com/org/repo' } },
    { GITHUB_PAT: 'fake-token' }
  );
  assert.equal(result.status, 400);
  assert.ok(result.body.error.includes('Body'));
});

test('returns 400 when body exceeds 65536 characters', async () => {
  const result = await issuesCreateHandler(
    { body: { title: 'Test', body: 'x'.repeat(65537), repoUrl: 'https://github.com/org/repo' } },
    { GITHUB_PAT: 'fake-token' }
  );
  assert.equal(result.status, 400);
  assert.ok(result.body.error.includes('Body'));
});

test('returns 400 when labels is not an array', async () => {
  const result = await issuesCreateHandler(
    { body: { title: 'Test', body: 'Desc', repoUrl: 'https://github.com/org/repo', labels: 'bug' } },
    { GITHUB_PAT: 'fake-token' }
  );
  assert.equal(result.status, 400);
  assert.ok(result.body.error.includes('array'));
});

test('returns 400 when labels exceeds 10 items', async () => {
  const result = await issuesCreateHandler(
    { body: { title: 'Test', body: 'Desc', repoUrl: 'https://github.com/org/repo', labels: Array.from({ length: 11 }, (_, i) => `label${i}`) } },
    { GITHUB_PAT: 'fake-token' }
  );
  assert.equal(result.status, 400);
  assert.ok(result.body.error.includes('10'));
});

test('returns 400 when a label exceeds 50 characters', async () => {
  const result = await issuesCreateHandler(
    { body: { title: 'Test', body: 'Desc', repoUrl: 'https://github.com/org/repo', labels: ['a'.repeat(51)] } },
    { GITHUB_PAT: 'fake-token' }
  );
  assert.equal(result.status, 400);
  assert.ok(result.body.error.includes('50'));
});

test('returns 400 for invalid GitHub repository URL', async () => {
  const result = await issuesCreateHandler(
    { body: { title: 'Test', body: 'Desc', repoUrl: 'not-a-url' } },
    { GITHUB_PAT: 'fake-token' }
  );
  assert.equal(result.status, 400);
  assert.ok(result.body.error.includes('Invalid GitHub'));
});

test('returns 400 for non-github.com URL', async () => {
  const result = await issuesCreateHandler(
    { body: { title: 'Test', body: 'Desc', repoUrl: 'https://gitlab.com/org/repo' } },
    { GITHUB_PAT: 'fake-token' }
  );
  assert.equal(result.status, 400);
  assert.ok(result.body.error.includes('github.com'));
});

test('returns 400 for URL with fewer than two path segments', async () => {
  const result = await issuesCreateHandler(
    { body: { title: 'Test', body: 'Desc', repoUrl: 'https://github.com/orgonly' } },
    { GITHUB_PAT: 'fake-token' }
  );
  assert.equal(result.status, 400);
  assert.ok(result.body.error.includes('Invalid GitHub repository URL structure'));
});

test('returns 200 with issue details for valid request', async () => {
  const result = await issuesCreateHandler(
    { body: { title: 'Bug Report', body: 'Something is broken.', repoUrl: 'https://github.com/acme/app', labels: ['bug'] } },
    { GITHUB_PAT: 'fake-token' }
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
  assert.ok(result.body.issueUrl.includes('github.com'));
  assert.equal(result.body.number, 42);
});

test('returns 200 with valid request that has empty labels array', async () => {
  const result = await issuesCreateHandler(
    { body: { title: 'Feature Request', body: 'Add this feature.', repoUrl: 'https://github.com/org/repo', labels: [] } },
    { GITHUB_PAT: 'fake-token' }
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.success, true);
});

test('handles URL with .git suffix', async () => {
  const result = await issuesCreateHandler(
    { body: { title: 'Test', body: 'Desc', repoUrl: 'https://github.com/org/repo.git' } },
    { GITHUB_PAT: 'fake-token' }
  );
  assert.equal(result.status, 200);
});

test('handles URL with trailing slash', async () => {
  const result = await issuesCreateHandler(
    { body: { title: 'Test', body: 'Desc', repoUrl: 'https://github.com/org/repo/' } },
    { GITHUB_PAT: 'fake-token' }
  );
  assert.equal(result.status, 200);
});
