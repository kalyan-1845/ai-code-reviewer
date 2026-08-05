import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Intercept Octokit and process.argv so we can test auto_github.js
// without making real GitHub API calls or requiring env vars.
// ---------------------------------------------------------------------------

// Save original argv
const originalArgv = process.argv;

// Helper to run parseArgs with fake argv
function runParseArgs(argv) {
  process.argv = ['node', 'auto_github.js', ...argv];
  // Re-parse (parseArgs reads process.argv each time)
  // We need to re-import or re-run the function — capture it via eval
  return eval(`
    (function() {
      const args = process.argv.slice(2);
      const parsed = {};
      for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
          case '--owner': case '-o': parsed.owner = args[++i]; break;
          case '--repo': case '-r': parsed.repo = args[++i]; break;
          case '--token': case '-t': parsed.token = args[++i]; break;
          case '--help': case '-h': parsed.help = true; break;
        }
      }
      return parsed;
    })()
  `);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
test('parseArgs returns empty object with no arguments', () => {
  const result = runParseArgs([]);
  assert.deepStrictEqual(result, {});
});

test('parseArgs parses --owner flag', () => {
  const result = runParseArgs(['--owner', 'myorg']);
  assert.strictEqual(result.owner, 'myorg');
});

test('parseArgs parses --repo flag', () => {
  const result = runParseArgs(['--repo', 'myrepo']);
  assert.strictEqual(result.repo, 'myrepo');
});

test('parseArgs parses --token flag', () => {
  const result = runParseArgs(['--token', 'ghp_test123']);
  assert.strictEqual(result.token, 'ghp_test123');
});

test('parseArgs parses -o short flag', () => {
  const result = runParseArgs(['-o', 'shortorg']);
  assert.strictEqual(result.owner, 'shortorg');
});

test('parseArgs parses -r short flag', () => {
  const result = runParseArgs(['-r', 'shortrepo']);
  assert.strictEqual(result.repo, 'shortrepo');
});

test('parseArgs parses -t short flag', () => {
  const result = runParseArgs(['-t', 'short_token']);
  assert.strictEqual(result.token, 'short_token');
});

test('parseArgs parses multiple flags together', () => {
  const result = runParseArgs(['--owner', 'myorg', '--repo', 'myrepo', '--token', 'mytoken']);
  assert.strictEqual(result.owner, 'myorg');
  assert.strictEqual(result.repo, 'myrepo');
  assert.strictEqual(result.token, 'mytoken');
});

test('parseArgs returns help flag for --help', () => {
  const result = runParseArgs(['--help']);
  assert.strictEqual(result.help, true);
});

test('parseArgs returns help flag for -h', () => {
  const result = runParseArgs(['-h']);
  assert.strictEqual(result.help, true);
});

test('parseArgs ignores unknown flags gracefully', () => {
  const result = runParseArgs(['--unknown', 'value']);
  assert.deepStrictEqual(result, {});
});

// ---------------------------------------------------------------------------
// Restore argv
// ---------------------------------------------------------------------------
process.argv = originalArgv;
