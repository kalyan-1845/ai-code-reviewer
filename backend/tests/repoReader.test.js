import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  readCodeFilesFromLocalDir,
  readCodeFilesFromRepo,
  REPO_READER_DEFAULTS,
} from '../utils/repoReader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixtureDir = path.join(__dirname, 'fixtures', 'repoReader_fixture');

// ---------- REPO_READER_DEFAULTS constant tests ----------

test('REPO_READER_DEFAULTS contains all expected cap fields', () => {
  assert.ok(REPO_READER_DEFAULTS !== null);
  assert.ok(typeof REPO_READER_DEFAULTS === 'object');
  assert.ok(Object.isFrozen(REPO_READER_DEFAULTS), 'REPO_READER_DEFAULTS should be frozen');
  assert.deepEqual(REPO_READER_DEFAULTS.extensions, ['.js', '.py', '.ts']);
  assert.equal(REPO_READER_DEFAULTS.maxFiles, 500);
  assert.equal(REPO_READER_DEFAULTS.maxDepth, 10);
  assert.equal(REPO_READER_DEFAULTS.maxBytes, 1024 * 1024);
  assert.equal(REPO_READER_DEFAULTS.cloneTimeoutMs, 120000);
});

test('REPO_READER_DEFAULTS.maxFiles is a positive integer', () => {
  assert.equal(Number.isInteger(REPO_READER_DEFAULTS.maxFiles), true);
  assert.ok(REPO_READER_DEFAULTS.maxFiles > 0);
});

test('REPO_READER_DEFAULTS.maxDepth is a positive integer', () => {
  assert.equal(Number.isInteger(REPO_READER_DEFAULTS.maxDepth), true);
  assert.ok(REPO_READER_DEFAULTS.maxDepth > 0);
});

test('REPO_READER_DEFAULTS.maxBytes is at least 1MB', () => {
  assert.ok(REPO_READER_DEFAULTS.maxBytes >= 1024 * 1024);
});

// ---------- Pure unit tests (no network) ----------

test('readCodeFilesFromLocalDir returns an array with the expected shape', async () => {
  const result = await readCodeFilesFromLocalDir(fixtureDir);
  assert.ok(Array.isArray(result));
  assert.ok(result.length > 0);
  for (const entry of result) {
    assert.equal(typeof entry.path, 'string');
    assert.equal(typeof entry.content, 'string');
    assert.equal(typeof entry.sizeBytes, 'number');
    assert.equal(typeof entry.language, 'string');
    // path must be repo-relative and use forward slashes
    assert.ok(!entry.path.startsWith('/'));
    assert.ok(!entry.path.includes('\\'));
  }
});

test('readCodeFilesFromLocalDir filters to .js, .py, .ts by default', async () => {
  const result = await readCodeFilesFromLocalDir(fixtureDir);
  const extensions = new Set(result.map((e) => path.extname(e.path).toLowerCase()));
  // Every returned file must be one of the three default extensions.
  for (const ext of extensions) {
    assert.ok(
      REPO_READER_DEFAULTS.extensions.includes(ext),
      `Unexpected extension returned: ${ext}`
    );
  }
  // The .md file must NOT appear.
  assert.ok(
    !result.some((e) => e.path.endsWith('.md')),
    'README.md should have been filtered out by extension allowlist'
  );
});

test('readCodeFilesFromLocalDir skips node_modules and .git directories', async () => {
  const result = await readCodeFilesFromLocalDir(fixtureDir);
  for (const entry of result) {
    assert.ok(
      !entry.path.includes('node_modules'),
      `node_modules should be skipped: ${entry.path}`
    );
    assert.ok(
      !entry.path.startsWith('.git/'),
      `.git should be skipped: ${entry.path}`
    );
  }
});

test('readCodeFilesFromLocalDir honors .reposageignore', async () => {
  const result = await readCodeFilesFromLocalDir(fixtureDir);
  assert.ok(
    !result.some((e) => e.path === 'src/ignored.js'),
    'src/ignored.js should be ignored via .reposageignore'
  );
  // The non-ignored file should still be present.
  assert.ok(
    result.some((e) => e.path === 'src/hello.js'),
    'src/hello.js should be present'
  );
});

test('readCodeFilesFromLocalDir populates language labels from extension', async () => {
  const result = await readCodeFilesFromLocalDir(fixtureDir);
  const byPath = Object.fromEntries(result.map((e) => [e.path, e]));
  assert.equal(byPath['src/hello.js'].language, 'javascript');
  assert.equal(byPath['src/app.py'].language, 'python');
  assert.equal(byPath['src/index.ts'].language, 'typescript');
});

test('readCodeFilesFromLocalDir respects an explicit extensions override', async () => {
  const result = await readCodeFilesFromLocalDir(fixtureDir, { extensions: ['.md'] });
  assert.equal(result.length, 1);
  assert.equal(result[0].path, 'src/README.md');
});

test('readCodeFilesFromLocalDir respects the maxFiles cap', async () => {
  const result = await readCodeFilesFromLocalDir(fixtureDir, { maxFiles: 1 });
  assert.equal(result.length, 1);
});

test('readCodeFilesFromLocalDir respects the maxDepth cap', async () => {
  const result = await readCodeFilesFromLocalDir(fixtureDir, { maxDepth: 0 });
  // With depth 0, only the root dir's direct files are returned (no subdir files)
  // The fixture has all files under src/ subdirectory
  const paths = result.map((e) => e.path);
  // src/ files should NOT appear when maxDepth is 0
  assert.ok(!paths.some((p) => p.startsWith('src/')), 'src/ should be beyond maxDepth 0');
});

test('readCodeFilesFromLocalDir skips files exceeding maxBytes', async () => {
  const result = await readCodeFilesFromLocalDir(fixtureDir, { maxBytes: 1 });
  // All fixture files are larger than 1 byte, so result should be empty
  assert.equal(result.length, 0);
});

test('readCodeFilesFromLocalDir handles a non-existent directory gracefully', async () => {
  const result = await readCodeFilesFromLocalDir('/non/existent/path/nowhere');
  assert.deepEqual(result, []);
});

test('readCodeFilesFromLocalDir handles extensions without leading dot', async () => {
  // Extensions without leading dot should still be accepted
  const result = await readCodeFilesFromLocalDir(fixtureDir, { extensions: ['py', 'JS'] });
  const paths = result.map((e) => e.path);
  assert.ok(paths.some((p) => p.endsWith('.py')), 'Should include .py files');
  assert.ok(paths.some((p) => p.endsWith('.js')), 'Should include .js files (case-insensitive)');
});

test('readCodeFilesFromLocalDir extensions option is case-insensitive', async () => {
  const result = await readCodeFilesFromLocalDir(fixtureDir, { extensions: ['.PY', '.Ts'] });
  const extensions = new Set(result.map((e) => path.extname(e.path).toLowerCase()));
  assert.ok(extensions.has('.py'), 'Should include .py');
  assert.ok(extensions.has('.ts'), 'Should include .ts');
});

test('readCodeFilesFromLocalDir populates correct sizeBytes', async () => {
  const result = await readCodeFilesFromLocalDir(fixtureDir);
  for (const entry of result) {
    assert.ok(entry.sizeBytes > 0, `sizeBytes should be positive for ${entry.path}`);
    assert.ok(Number.isInteger(entry.sizeBytes), `sizeBytes should be integer for ${entry.path}`);
  }
});

// ---------- Network-touching test (real clone) ----------

test('readCodeFilesFromRepo clones a public repo and returns a JSON-serializable array', async () => {
  // octocat/Spoon-Knife is tiny (3 files: README.md, index.html, styles.css)
  // and a stable public fixture for testing real clones.
  // Skip this test gracefully if the sandbox has no network rather than failing.
  if (process.env.SKIP_NETWORK_TESTS === '1') {
    return;
  }
  const url = 'https://github.com/octocat/Spoon-Knife';
  const result = await readCodeFilesFromRepo(url, {
    extensions: ['.md'],
    maxFiles: 50,
  });
  assert.ok(Array.isArray(result));
  assert.ok(result.length > 0, 'Expected at least one .md file in octocat/Spoon-Knife');

  // Result must be JSON-serializable (this is the literal ask).
  const json = JSON.stringify(result);
  assert.ok(json.length > 0);
  const roundTripped = JSON.parse(json);
  assert.equal(roundTripped.length, result.length);
}, { timeout: 60000 });

test('readCodeFilesFromRepo rejects malformed URLs with a clear error', async () => {
  await assert.rejects(
    () => readCodeFilesFromRepo('not-a-url'),
    (err) => /Invalid GitHub repository URL/.test(err.message)
  );
  await assert.rejects(
    () => readCodeFilesFromRepo('https://gitlab.com/owner/repo'),
    (err) => /Invalid GitHub repository URL/.test(err.message)
  );
});

// ---------- Cleanup invariant ----------

test('readCodeFilesFromRepo cleans up the temp clone even on URL validation failure', async () => {
  const tempReposDir = path.join(__dirname, '..', 'temp_repos');
  const before = fs.existsSync(tempReposDir)
    ? fs.readdirSync(tempReposDir).filter((n) => n.startsWith('rag_'))
    : [];
  await assert.rejects(() => readCodeFilesFromRepo('https://example.com/not-github'));
  const after = fs.existsSync(tempReposDir)
    ? fs.readdirSync(tempReposDir).filter((n) => n.startsWith('rag_'))
    : [];
  // No 'rag_' directories should have been created for a URL that fails validation
  // before the clone step. (The clone path is only allocated inside the try block.)
  assert.equal(after.length, before.length, 'No rag_* temp dirs should be left behind');
});
