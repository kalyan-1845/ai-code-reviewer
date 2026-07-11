import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { getFolderSize } from '../utils/fileHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const canCreateSymlinks = (() => {
  try {
    const tempTarget = path.join(os.tmpdir(), `symlink-test-target-${Date.now()}`);
    const tempLink = path.join(os.tmpdir(), `symlink-test-link-${Date.now()}`);
    fs.writeFileSync(tempTarget, 'test');
    fs.symlinkSync(tempTarget, tempLink);
    fs.unlinkSync(tempLink);
    fs.unlinkSync(tempTarget);
    return true;
  } catch {
    return false;
  }
})();

test('getFolderSize returns correct size for deeply nested directories', async () => {
  const base = path.join(__dirname, 'temp_edge_nested');
  const cleanup = () => {
    if (fs.existsSync(base)) {
      fs.rmSync(base, { recursive: true, force: true });
    }
  };
  cleanup();

  // 5-level deep directory
  fs.mkdirSync(path.join(base, 'l1', 'l2', 'l3', 'l4', 'l5'), { recursive: true });
  fs.writeFileSync(path.join(base, 'l1', 'l2', 'l3', 'l4', 'l5', 'deep.txt'), 'deep content here');

  try {
    const size = await getFolderSize(base);
    assert.ok(size > 0, 'Deep nested directory should have non-zero size');
  } finally {
    cleanup();
  }
});

test('getFolderSize counts files with unicode names', async () => {
  const tempDir = path.join(__dirname, 'temp_edge_unicode');
  const cleanup = () => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  };
  cleanup();

  fs.mkdirSync(tempDir);
  const content = 'hello';
  fs.writeFileSync(path.join(tempDir, '\u4e2d\u6587\u6587\u4ef6.txt'), content);  // Chinese chars
  fs.writeFileSync(path.join(tempDir, '\u65e5\u672c\u8a9e.txt'), content);           // Japanese chars

  try {
    const expectedSize = Buffer.byteLength(content, 'utf8') * 2;
    const size = await getFolderSize(tempDir);
    assert.equal(size, expectedSize, 'Unicode filenames should be counted correctly');
  } finally {
    cleanup();
  }
});

test('getFolderSize counts files with leading-dot names', async () => {
  const tempDir = path.join(__dirname, 'temp_edge_dotfile');
  const cleanup = () => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  };
  cleanup();

  fs.mkdirSync(tempDir);
  const content = 'secret data';
  fs.writeFileSync(path.join(tempDir, '.gitignore'), content);
  fs.writeFileSync(path.join(tempDir, '.env'), content);
  fs.mkdirSync(path.join(tempDir, '.config'));
  fs.writeFileSync(path.join(tempDir, '.config', 'rc'), content);

  try {
    const expectedSize = Buffer.byteLength(content, 'utf8') * 3;
    const size = await getFolderSize(tempDir);
    assert.equal(size, expectedSize, 'Leading-dot files should be counted correctly');
  } finally {
    cleanup();
  }
});

test('getFolderSize skips symlinked subdirectories without following them', { skip: !canCreateSymlinks }, async () => {
  // Create a real directory with content
  const realDir = fs.mkdtempSync(path.join(os.tmpdir(), 'real-target-'));
  fs.writeFileSync(path.join(realDir, 'real_file.txt'), 'real content');

  // Create a parent dir containing a symlink to the real dir
  const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'symlink-parent-'));
  const subDir = path.join(parentDir, 'sub');
  fs.mkdirSync(subDir);
  const symlinkPath = path.join(subDir, 'external_link');
  fs.symlinkSync(realDir, symlinkPath);

  try {
    const size = await getFolderSize(parentDir);
    // Symlinked subdirectory should be skipped, so only subDir itself (empty dir = 0) is counted
    assert.equal(size, 0, 'Symlinked subdirectories should be skipped, not followed');
  } finally {
    fs.unlinkSync(symlinkPath);
    fs.unlinkSync(path.join(realDir, 'real_file.txt'));
    fs.rmdirSync(realDir);
    fs.rmSync(parentDir, { recursive: true, force: true });
  }
});

test('getFolderSize handles empty subdirectories correctly', async () => {
  const tempDir = path.join(__dirname, 'temp_edge_empty_sub');
  const cleanup = () => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  };
  cleanup();

  fs.mkdirSync(tempDir);
  fs.mkdirSync(path.join(tempDir, 'empty_subdir1'));
  fs.mkdirSync(path.join(tempDir, 'empty_subdir2'));
  fs.mkdirSync(path.join(tempDir, 'sub'));
  fs.mkdirSync(path.join(tempDir, 'sub', 'nested_empty'));
  const content = 'visible';
  fs.writeFileSync(path.join(tempDir, 'file.txt'), content);

  try {
    const expectedSize = Buffer.byteLength(content, 'utf8');
    const size = await getFolderSize(tempDir);
    assert.equal(size, expectedSize, 'Empty subdirectories should contribute 0 to total size');
  } finally {
    cleanup();
  }
});

test('getFolderSize returns 0 for a directory with only broken symlinks', { skip: !canCreateSymlinks }, async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'broken_sym_edge-'));
  const brokenLink = path.join(tempDir, 'broken_link');
  fs.symlinkSync('/this/path/does/not/exist', brokenLink);

  try {
    const size = await getFolderSize(tempDir);
    assert.equal(size, 0, 'Directory with only broken symlinks should return 0');
  } finally {
    fs.unlinkSync(brokenLink);
    fs.rmdirSync(tempDir);
  }
});
