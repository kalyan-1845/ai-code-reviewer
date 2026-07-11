import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadIgnorePatterns, isIgnored, readFilesRecursively } from '../utils/ignoreHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('loadIgnorePatterns should load patterns correctly from file', () => {
  const tempDir = path.join(__dirname, 'temp_test_ignore');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }
  const ignoreFile = path.join(tempDir, '.reposageignore');
  fs.writeFileSync(ignoreFile, 'node_modules/\n# comment line\n*.log\n   \nsecret.key');

  const patterns = loadIgnorePatterns(tempDir);
  assert.deepEqual(patterns, ['node_modules/', '*.log', 'secret.key']);

  // Clean up
  fs.unlinkSync(ignoreFile);
  fs.rmdirSync(tempDir);
});

test('isIgnored should match directory, extension, and wildcard patterns correctly', () => {
  const patterns = ['node_modules/', '*.log', 'dist', 'temp/*.txt'];
  const baseDir = '/app';

  assert.equal(isIgnored('/app/node_modules/index.js', patterns, baseDir), true);
  assert.equal(isIgnored('/app/node_modules', patterns, baseDir), true);
  assert.equal(isIgnored('/app/src/index.js', patterns, baseDir), false);
  assert.equal(isIgnored('/app/error.log', patterns, baseDir), true);
  assert.equal(isIgnored('/app/dist/main.js', patterns, baseDir), true);
  assert.equal(isIgnored('/app/temp/data.txt', patterns, baseDir), true);
  assert.equal(isIgnored('/app/temp/sub/data.txt', patterns, baseDir), false);
});

test('readFilesRecursively should list valid files and respect ignore list', () => {
  const tempDir = path.join(__dirname, 'temp_test_read');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }
  
  // Create directories
  fs.mkdirSync(path.join(tempDir, 'src'));
  fs.mkdirSync(path.join(tempDir, 'node_modules'));
  
  // Create files
  fs.writeFileSync(path.join(tempDir, 'src', 'main.js'), 'console.log("hello");');
  fs.writeFileSync(path.join(tempDir, 'src', 'style.css'), 'body {}');
  fs.writeFileSync(path.join(tempDir, 'node_modules', 'dep.js'), '/* dependency */');
  fs.writeFileSync(path.join(tempDir, 'ignored.log'), 'logs');

  const files = readFilesRecursively(tempDir, [], tempDir, ['*.log']);
  const fileNames = files.map(f => f.name);

  // Should include src/main.js and src/style.css
  assert.ok(fileNames.includes('src/main.js'));
  assert.ok(fileNames.includes('src/style.css'));

  // Should exclude node_modules/dep.js (built-in rule) and ignored.log (pattern rule)
  assert.equal(fileNames.includes('node_modules/dep.js'), false);
  assert.equal(fileNames.includes('ignored.log'), false);

  // Clean up
  fs.unlinkSync(path.join(tempDir, 'src', 'main.js'));
  fs.unlinkSync(path.join(tempDir, 'src', 'style.css'));
  fs.rmdirSync(path.join(tempDir, 'src'));
  fs.unlinkSync(path.join(tempDir, 'node_modules', 'dep.js'));
  fs.rmdirSync(path.join(tempDir, 'node_modules'));
  fs.unlinkSync(path.join(tempDir, 'ignored.log'));
  fs.rmdirSync(tempDir);
});

test('readFilesRecursively should skip files exceeding 100KB limit', () => {
  const tempDir = path.join(__dirname, 'temp_test_size');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  // Create a small file (e.g. 12 bytes)
  const smallFilePath = path.join(tempDir, 'small.js');
  fs.writeFileSync(smallFilePath, 'const a = 1;');

  // Create a large file exceeding 100KB (101KB)
  const largeFilePath = path.join(tempDir, 'large.js');
  const largeContent = 'a'.repeat(101 * 1024);
  fs.writeFileSync(largeFilePath, largeContent);

  const skippedFiles = [];
  const files = readFilesRecursively(tempDir, [], tempDir, [], 0, skippedFiles);
  const fileNames = files.map(f => f.name);

  // Should include small.js
  assert.ok(fileNames.includes('small.js'));
  // Should exclude large.js
  assert.equal(fileNames.includes('large.js'), false);

  // Should record large.js in skippedFiles
  assert.equal(skippedFiles.length, 1);
  assert.equal(skippedFiles[0].name, 'large.js');
  assert.equal(skippedFiles[0].reason, 'File exceeds size limit of 100KB');
  assert.equal(skippedFiles[0].size, 101 * 1024);

  // Clean up
  fs.unlinkSync(smallFilePath);
  fs.unlinkSync(largeFilePath);
  fs.rmdirSync(tempDir);
});

