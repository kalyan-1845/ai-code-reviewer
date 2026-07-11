import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFilesRecursively, detectShebangLanguage } from '../utils/ignoreHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('detectShebangLanguage detects python from #!/usr/bin/env python3', () => {
  assert.equal(detectShebangLanguage('#!/usr/bin/env python3\nprint("hi")'), 'python');
});

test('detectShebangLanguage detects python from #!/usr/bin/python', () => {
  assert.equal(detectShebangLanguage('#!/usr/bin/python\nprint("hi")'), 'python');
});

test('detectShebangLanguage detects javascript from #!/usr/bin/env node', () => {
  assert.equal(detectShebangLanguage('#!/usr/bin/env node\nconsole.log("hi")'), 'javascript');
});

test('detectShebangLanguage detects shell from #!/bin/bash', () => {
  assert.equal(detectShebangLanguage('#!/bin/bash\necho hi'), 'shell');
});

test('detectShebangLanguage detects shell from #!/bin/sh', () => {
  assert.equal(detectShebangLanguage('#!/bin/sh\necho hi'), 'shell');
});

test('detectShebangLanguage detects ruby from #!/usr/bin/env ruby', () => {
  assert.equal(detectShebangLanguage('#!/usr/bin/env ruby\nputs "hi"'), 'ruby');
});

test('detectShebangLanguage returns null for content with no shebang', () => {
  assert.equal(detectShebangLanguage('print("hi")'), null);
});

test('detectShebangLanguage returns null for unrecognized shebang interpreter', () => {
  assert.equal(detectShebangLanguage('#!/usr/bin/env some-unknown-interpreter\ndo stuff'), null);
});

test('detectShebangLanguage returns null for empty or non-string input', () => {
  assert.equal(detectShebangLanguage(''), null);
  assert.equal(detectShebangLanguage(null), null);
  assert.equal(detectShebangLanguage(undefined), null);
});

test('detectShebangLanguage only inspects the first line, ignoring content after it', () => {
  const content = '#!/usr/bin/env python3\n#!/usr/bin/env node\nprint("hi")';
  assert.equal(detectShebangLanguage(content), 'python');
});

test('readFilesRecursively includes an extensionless file with a recognized shebang', () => {
  const tempDir = path.join(__dirname, 'temp_shebang_included');
  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true });
  fs.mkdirSync(tempDir);

  fs.writeFileSync(path.join(tempDir, 'process'), '#!/usr/bin/env python3\nimport os\nos.system(user_input)');

  const files = readFilesRecursively(tempDir, [], tempDir, []);
  const found = files.find(f => f.name === 'process');

  assert.ok(found, 'extensionless shebang script should be included, not silently skipped');
  assert.equal(found.detectedLanguage, 'python');

  fs.rmSync(tempDir, { recursive: true });
});

test('readFilesRecursively skips an extensionless file with no shebang (unchanged behavior)', () => {
  const tempDir = path.join(__dirname, 'temp_shebang_no_match');
  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true });
  fs.mkdirSync(tempDir);

  fs.writeFileSync(path.join(tempDir, 'LICENSE'), 'MIT License\n\nCopyright (c) 2026');
  fs.writeFileSync(path.join(tempDir, 'Makefile'), 'build:\n\tgo build ./...');

  const files = readFilesRecursively(tempDir, [], tempDir, []);
  const fileNames = files.map(f => f.name);

  assert.equal(fileNames.includes('LICENSE'), false, 'non-script extensionless files should still be skipped');
  assert.equal(fileNames.includes('Makefile'), false, 'non-script extensionless files should still be skipped');

  fs.rmSync(tempDir, { recursive: true });
});

test('readFilesRecursively includes multiple shebang languages in the same directory', () => {
  const tempDir = path.join(__dirname, 'temp_shebang_multi');
  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true });
  fs.mkdirSync(tempDir);

  fs.writeFileSync(path.join(tempDir, 'deploy'), '#!/usr/bin/env bash\nset -e\necho deploying');
  fs.writeFileSync(path.join(tempDir, 'migrate'), '#!/usr/bin/env node\nconsole.log("migrating")');

  const files = readFilesRecursively(tempDir, [], tempDir, []);
  const byName = Object.fromEntries(files.map(f => [f.name, f]));

  assert.equal(byName['deploy']?.detectedLanguage, 'shell');
  assert.equal(byName['migrate']?.detectedLanguage, 'javascript');

  fs.rmSync(tempDir, { recursive: true });
});

test('readFilesRecursively does not add a detectedLanguage field for files with a real extension', () => {
  const tempDir = path.join(__dirname, 'temp_shebang_ext_unaffected');
  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true });
  fs.mkdirSync(tempDir);

  fs.writeFileSync(path.join(tempDir, 'script.py'), '#!/usr/bin/env python3\nprint("hi")');

  const files = readFilesRecursively(tempDir, [], tempDir, []);
  const found = files.find(f => f.name === 'script.py');

  assert.ok(found, '.py file should be included as before');
  assert.equal(found.detectedLanguage, undefined, 'extension-based files should not gain a detectedLanguage field');

  fs.rmSync(tempDir, { recursive: true });
});
