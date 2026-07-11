import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  readCodeFilesFromLocalDir,
  REPO_READER_DEFAULTS,
} from '../utils/repoReader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixtureDir = path.join(__dirname, 'fixtures', 'repoReader_fixture');

// ---------------------------------------------------------------------------
// Tests: REPO_READER_DEFAULTS
// ---------------------------------------------------------------------------
test('REPO_READER_DEFAULTS is exported and is an object', () => {
  assert.ok(REPO_READER_DEFAULTS !== null, 'REPO_READER_DEFAULTS should not be null');
  assert.equal(typeof REPO_READER_DEFAULTS, 'object', 'REPO_READER_DEFAULTS should be an object');
});

test('REPO_READER_DEFAULTS is frozen (Object.freeze)', () => {
  assert.ok(
    Object.isFrozen(REPO_READER_DEFAULTS),
    'REPO_READER_DEFAULTS should be frozen to prevent accidental mutation'
  );
});

test('REPO_READER_DEFAULTS has extensions property', () => {
  assert.ok('extensions' in REPO_READER_DEFAULTS, 'REPO_READER_DEFAULTS should have extensions');
  assert.ok(Array.isArray(REPO_READER_DEFAULTS.extensions), 'extensions should be an array');
});

test('REPO_READER_DEFAULTS.extensions contains .js, .py, .ts', () => {
  const exts = REPO_READER_DEFAULTS.extensions;
  assert.ok(exts.includes('.js'), 'extensions should include .js');
  assert.ok(exts.includes('.py'), 'extensions should include .py');
  assert.ok(exts.includes('.ts'), 'extensions should include .ts');
});

test('REPO_READER_DEFAULTS.extensions does not include non-code extensions by default', () => {
  const exts = REPO_READER_DEFAULTS.extensions;
  assert.ok(!exts.includes('.md'), '.md should not be in default extensions');
  assert.ok(!exts.includes('.txt'), '.txt should not be in default extensions');
  assert.ok(!exts.includes('.json'), '.json should not be in default extensions');
});

test('REPO_READER_DEFAULTS has maxFiles property', () => {
  assert.ok('maxFiles' in REPO_READER_DEFAULTS, 'REPO_READER_DEFAULTS should have maxFiles');
  assert.equal(typeof REPO_READER_DEFAULTS.maxFiles, 'number', 'maxFiles should be a number');
  assert.ok(REPO_READER_DEFAULTS.maxFiles > 0, 'maxFiles should be positive');
});

test('REPO_READER_DEFAULTS has maxDepth property', () => {
  assert.ok('maxDepth' in REPO_READER_DEFAULTS, 'REPO_READER_DEFAULTS should have maxDepth');
  assert.equal(typeof REPO_READER_DEFAULTS.maxDepth, 'number', 'maxDepth should be a number');
  assert.ok(REPO_READER_DEFAULTS.maxDepth > 0, 'maxDepth should be positive');
});

test('REPO_READER_DEFAULTS has maxBytes property', () => {
  assert.ok('maxBytes' in REPO_READER_DEFAULTS, 'REPO_READER_DEFAULTS should have maxBytes');
  assert.equal(typeof REPO_READER_DEFAULTS.maxBytes, 'number', 'maxBytes should be a number');
  assert.ok(REPO_READER_DEFAULTS.maxBytes > 0, 'maxBytes should be positive');
});

test('REPO_READER_DEFAULTS.maxBytes defaults to 1MB', () => {
  assert.equal(REPO_READER_DEFAULTS.maxBytes, 1024 * 1024, 'maxBytes should default to 1MB');
});

test('REPO_READER_DEFAULTS.maxFiles defaults to 500', () => {
  assert.equal(REPO_READER_DEFAULTS.maxFiles, 500, 'maxFiles should default to 500');
});

test('REPO_READER_DEFAULTS.maxDepth defaults to 10', () => {
  assert.equal(REPO_READER_DEFAULTS.maxDepth, 10, 'maxDepth should default to 10');
});

// ---------------------------------------------------------------------------
// Tests: Extension-to-language mapping through public API
// ---------------------------------------------------------------------------
test('readCodeFilesFromLocalDir assigns language javascript to .js files', () => {
  const result = readCodeFilesFromLocalDir(fixtureDir);
  // src/hello.js is the JS file in the fixture
  const helloEntry = result.find((e) => e.path === 'src/hello.js');
  assert.ok(helloEntry, 'src/hello.js should be found');
  assert.equal(helloEntry.language, 'javascript', '.js files should have language javascript');
});

test('readCodeFilesFromLocalDir assigns language python to .py files', () => {
  const result = readCodeFilesFromLocalDir(fixtureDir);
  const pyFile = result.find((e) => e.path.endsWith('.py'));
  assert.ok(pyFile, 'app.py should be found');
  assert.equal(pyFile.language, 'python', '.py files should have language python');
});

test('readCodeFilesFromLocalDir assigns language typescript to .ts files', () => {
  const result = readCodeFilesFromLocalDir(fixtureDir);
  const tsFile = result.find((e) => e.path.endsWith('.ts'));
  assert.ok(tsFile, 'index.ts should be found');
  assert.equal(tsFile.language, 'typescript', '.ts files should have language typescript');
});

test('readCodeFilesFromLocalDir skips .md files by default', () => {
  const result = readCodeFilesFromLocalDir(fixtureDir);
  const mdFiles = result.filter((e) => e.path.endsWith('.md'));
  assert.equal(mdFiles.length, 0, '.md files should be skipped by default');
});

test('readCodeFilesFromLocalDir allows .md when explicitly requested', () => {
  const result = readCodeFilesFromLocalDir(fixtureDir, { extensions: ['.md'] });
  const mdFiles = result.filter((e) => e.path.endsWith('.md'));
  assert.ok(mdFiles.length > 0, '.md files should be included when explicitly requested');
});

test('readCodeFilesFromLocalDir returns language as a string for each entry', () => {
  const result = readCodeFilesFromLocalDir(fixtureDir);
  result.forEach((entry) => {
    assert.equal(typeof entry.language, 'string', `language for ${entry.path} should be a string`);
    assert.ok(entry.language.length > 0, `language for ${entry.path} should not be empty`);
  });
});

test('readCodeFilesFromLocalDir applies .reposageignore patterns', () => {
  const result = readCodeFilesFromLocalDir(fixtureDir);
  const ignored = result.find((e) => e.path.endsWith('ignored.js') || e.path.includes('ignored'));
  assert.ok(!ignored, 'src/ignored.js should be excluded by .reposageignore');
});

test('readCodeFilesFromLocalDir returns empty language for unknown extensions when extended', () => {
  // When we override extensions to include .txt (not in the language map),
  // it should still work but language might be empty or undefined
  const result = readCodeFilesFromLocalDir(fixtureDir, { extensions: ['.txt'] });
  // .txt is not in the default extension map, so language would be empty/undefined
  // This test documents the current behavior
  result.forEach((entry) => {
    assert.ok(
      typeof entry.language === 'string',
      `language should be a string even for unknown extensions`
    );
  });
});

test('REPO_READER_DEFAULTS clone is not affected by mutation attempts', () => {
  // Attempt to mutate (should not affect frozen object)
  const before = JSON.stringify(REPO_READER_DEFAULTS);
  try {
    REPO_READER_DEFAULTS.maxFiles = 999;
  } catch {
    // Expected - frozen object
  }
  assert.equal(
    JSON.stringify(REPO_READER_DEFAULTS),
    before,
    'Frozen object should not be affected by mutation attempts'
  );
});

test('readCodeFilesFromLocalDir returns empty array for empty directory', async () => {
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');
  const emptyDir = path.join(os.tmpdir(), `repo_reader_empty_${Date.now()}`);
  fs.mkdirSync(emptyDir, { recursive: true });
  try {
    const result = readCodeFilesFromLocalDir(emptyDir);
    assert.deepEqual(result, [], 'Empty directory should return empty array');
  } finally {
    fs.rmdirSync(emptyDir);
  }
});

test('readCodeFilesFromLocalDir returns empty array when only unsupported file types exist', async () => {
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');
  const unsuppDir = path.join(os.tmpdir(), `repo_reader_unsupp_${Date.now()}`);
  fs.mkdirSync(unsuppDir, { recursive: true });
  try {
    fs.writeFileSync(path.join(unsuppDir, 'data.csv'), 'a,b,c\n1,2,3');
    fs.writeFileSync(path.join(unsuppDir, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    fs.writeFileSync(path.join(unsuppDir, 'config.toml'), '[section]\nkey=value');
    const result = readCodeFilesFromLocalDir(unsuppDir);
    // csv, png, and toml are not in the default extension set (.js, .py, .ts)
    assert.deepEqual(result, [], 'Only unsupported extensions should return empty array');
  } finally {
    fs.rmSync(unsuppDir, { recursive: true, force: true });
  }
});

test('readCodeFilesFromLocalDir returns files when extension filter includes unsupported types', async () => {
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');
  const mixedDir = path.join(os.tmpdir(), `repo_reader_mixed_${Date.now()}`);
  fs.mkdirSync(mixedDir, { recursive: true });
  try {
    fs.writeFileSync(path.join(mixedDir, 'script.py'), 'x = 1');
    fs.writeFileSync(path.join(mixedDir, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const result = readCodeFilesFromLocalDir(mixedDir, { extensions: ['.py', '.png'] });
    assert.equal(result.length, 2, 'Should include both py and png when both extensions are specified');
    const extensions = result.map(e => path.extname(e.path).toLowerCase()).sort();
    assert.deepEqual(extensions, ['.png', '.py']);
  } finally {
    fs.rmSync(mixedDir, { recursive: true, force: true });
  }
});

test('REPO_READER_DEFAULTS cloneTimeoutMs is a positive integer in milliseconds', () => {
  assert.equal(Number.isInteger(REPO_READER_DEFAULTS.cloneTimeoutMs), true);
  assert.ok(REPO_READER_DEFAULTS.cloneTimeoutMs > 0, 'cloneTimeoutMs should be positive');
  assert.ok(REPO_READER_DEFAULTS.cloneTimeoutMs >= 1000, 'cloneTimeoutMs should be at least 1 second');
});
