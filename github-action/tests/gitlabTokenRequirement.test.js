import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Regression tests for issue #3670. GitLab MRs must authenticate with an
// explicit GitLab token and must NEVER fall back to GITHUB_TOKEN (a GitHub PAT
// cannot authenticate against the GitLab API and produces confusing runtime
// failures). The provider-selection block in github-action/index.js must:
//   1. require GITLAB_TOKEN or the gitlab-token input in GITLAB_CI mode and
//      fail fast with a clear message when neither is present, and
//   2. construct GitLabProvider with only the GitLab token.
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const runtime = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

test('GitLab CI mode requires an explicit GitLab token and fails fast without it', () => {
  assert.match(runtime, /process\.env\.GITLAB_TOKEN\s*\|\|\s*core\.getInput\(['"]gitlab-token['"]\)/,
    'GitLab token must be read from GITLAB_TOKEN or the gitlab-token input');
  assert.match(runtime, /if\s*\(!gitlabToken\)\s*\{/,
    'a missing GitLab token must branch to a failure path');
  assert.match(runtime, /core\.setFailed\([^)]*GITLAB_TOKEN[^)]*\)/,
    'missing GitLab token must fail fast with a clear message');
  assert.match(runtime, /new GitLabProvider\(gitlabToken\)/,
    'GitLabProvider must be constructed from the resolved GitLab token');
});

test('GitLab provider construction never falls back to GITHUB_TOKEN', () => {
  const providerBlock = runtime.match(/let provider;[\s\S]*?provider\.init\(\);/);
  assert.ok(providerBlock, 'provider selection block must exist');
  assert.doesNotMatch(providerBlock[0], /GITHUB_TOKEN/,
    'the provider-selection block must not reference GITHUB_TOKEN for GitLab');
  assert.doesNotMatch(runtime, /new GitLabProvider\([^)]*GITHUB_TOKEN[^)]*\)/,
    'GitLabProvider must never be constructed with a GitHub token');
});
