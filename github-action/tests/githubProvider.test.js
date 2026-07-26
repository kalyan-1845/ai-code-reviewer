import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Mock functions — shared across all tests
// ---------------------------------------------------------------------------

let callCount = 0;
let nextPullsGetData = 'mock-diff-content';
let nextPrBodyData = 'PR body text';
let nextAddLabelsError = null;

const mockPullsGet = mock.fn(async () => {
  callCount++;
  return { data: nextPullsGetData };
});
const mockPullsCreateReview = mock.fn(async () => ({ data: {} }));
const mockPullsUpdate = mock.fn(async () => ({ data: {} }));
const mockReposGetContent = mock.fn(async () => ({
  data: { content: Buffer.from('decoded-content').toString('base64') }
}));
const mockIssuesAddLabels = mock.fn(async () => {
  if (nextAddLabelsError) throw nextAddLabelsError;
  return { data: {} };
});

const sharedContext = {
  issue: { owner: 'test-owner', repo: 'test-repo', number: 42 },
  payload: { pull_request: { head: { sha: 'abc123sha' } } },
};
const noHeadContext = {
  issue: { owner: 'o', repo: 'r', number: 1 },
  payload: { pull_request: {} },
};

// ---------------------------------------------------------------------------
// Mock module once
// ---------------------------------------------------------------------------

mock.module('@actions/github', {
  namedExports: {
    getOctokit: mock.fn(() => ({
      rest: {
        pulls: { get: mockPullsGet, createReview: mockPullsCreateReview, update: mockPullsUpdate },
        repos: { getContent: mockReposGetContent },
        issues: { addLabels: mockIssuesAddLabels },
      },
    })),
    context: sharedContext,
  },
});

const { GitHubProvider } = await import('../providers/GitHubProvider.js');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('GitHubProvider init does not throw', () => {
  const provider = new GitHubProvider('fake-token');
  provider.init();
});

test('GitHubProvider getContext returns correct owner, repo, pullNumber, headSha', () => {
  const provider = new GitHubProvider('fake-token');
  const ctx = provider.getContext();
  assert.equal(ctx.owner, 'test-owner');
  assert.equal(ctx.repo, 'test-repo');
  assert.equal(ctx.pullNumber, 42);
  assert.equal(ctx.headSha, 'abc123sha');
});

test('GitHubProvider getDiff calls octokit.rest.pulls.get and returns diff content', async () => {
  nextPullsGetData = 'diff-output-from-api';
  const provider = new GitHubProvider('fake-token');
  const result = await provider.getDiff();
  assert.equal(result, 'diff-output-from-api');
  assert.equal(mockPullsGet.mock.callCount(), 1);
  const args = mockPullsGet.mock.calls[0].arguments[0];
  assert.equal(args.owner, 'test-owner');
  assert.equal(args.repo, 'test-repo');
  assert.equal(args.pull_number, 42);
  assert.equal(args.mediaType.format, 'diff');
  nextPullsGetData = 'mock-diff-content'; // reset
});

test('GitHubProvider getFileContent decodes base64 content to utf8 string', async () => {
  mockReposGetContent.mock.mockImplementationOnce(
    async () => ({ data: { content: Buffer.from('hello world from file').toString('base64') } })
  );
  const provider = new GitHubProvider('fake-token');
  const content = await provider.getFileContent('src/index.js', 'main');
  assert.equal(content, 'hello world from file');
  assert.equal(mockReposGetContent.mock.callCount(), 1);
  const args = mockReposGetContent.mock.calls[0].arguments[0];
  assert.equal(args.path, 'src/index.js');
  assert.equal(args.ref, 'main');
});

test('GitHubProvider createReview calls octokit.rest.pulls.createReview with review data', async () => {
  const provider = new GitHubProvider('fake-token');
  const reviewData = {
    event: 'REQUEST_CHANGES',
    body: 'Needs fixes',
    comments: [{ path: 'file.js', line: 10, body: 'Fix this' }]
  };
  await provider.createReview(reviewData);
  assert.equal(mockPullsCreateReview.mock.callCount(), 1);
  const args = mockPullsCreateReview.mock.calls[0].arguments[0];
  assert.equal(args.event, 'REQUEST_CHANGES');
  assert.equal(args.body, 'Needs fixes');
  assert.deepEqual(args.comments, [{ path: 'file.js', line: 10, body: 'Fix this' }]);
});

test('GitHubProvider addLabel calls octokit.rest.issues.addLabels', async () => {
  mockIssuesAddLabels.mock.mockImplementationOnce(async () => ({ data: {} }));
  const provider = new GitHubProvider('fake-token');
  await provider.addLabel('gssoc26');
  assert.equal(mockIssuesAddLabels.mock.callCount(), 1);
  const args = mockIssuesAddLabels.mock.calls[0].arguments[0];
  assert.deepEqual(args.labels, ['gssoc26']);
  // Reset to non-error implementation
  mockIssuesAddLabels.mock.mockImplementationOnce(async () => ({ data: {} }));
});

test('GitHubProvider addLabel does not throw on API error (suppressed by catch)', async () => {
  mockIssuesAddLabels.mock.mockImplementationOnce(
    async () => { throw new Error('API error'); }
  );
  mockIssuesAddLabels.mock.mockImplementationOnce(async () => ({ data: {} }));
  const provider = new GitHubProvider('fake-token');
  // Should not throw despite API error
  await provider.addLabel('some-label');
});

test('GitHubProvider getPRBody returns PR body string', async () => {
  mockPullsGet.mock.mockImplementationOnce(
    async () => ({ data: { body: 'Custom PR body' } })
  );
  const provider = new GitHubProvider('fake-token');
  const body = await provider.getPRBody();
  assert.equal(body, 'Custom PR body');
});

test('GitHubProvider getPRBody returns empty string when body is null', async () => {
  mockPullsGet.mock.mockImplementationOnce(
    async () => ({ data: { body: null } })
  );
  const provider = new GitHubProvider('fake-token');
  const body = await provider.getPRBody();
  assert.equal(body, '');
});

test('GitHubProvider updatePRBody calls octokit.rest.pulls.update with new body', async () => {
  const provider = new GitHubProvider('fake-token');
  await provider.updatePRBody('Updated PR body text');
  assert.equal(mockPullsUpdate.mock.callCount(), 1);
  const args = mockPullsUpdate.mock.calls[0].arguments[0];
  assert.equal(args.body, 'Updated PR body text');
  assert.equal(args.pull_number, 42);
});
