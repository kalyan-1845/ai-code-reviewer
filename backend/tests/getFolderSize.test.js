import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { getFolderSize } from '../utils/fileHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('getFolderSize returns 0 for non-existent directory', async () => {
  const size = await getFolderSize('/non/existent/path/12345');
  assert.equal(size, 0, 'Non-existent path should return 0');
});

test('getFolderSize returns 0 for empty directory', async () => {
  const tempDir = path.join(__dirname, 'temp_size_empty');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
  fs.mkdirSync(tempDir);

  const size = await getFolderSize(tempDir);
  assert.equal(size, 0, 'Empty directory should return 0 bytes');

  fs.rmdirSync(tempDir);
});

test('getFolderSize returns exact size for single file', async () => {
  const tempDir = path.join(__dirname, 'temp_size_single');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
  fs.mkdirSync(tempDir);

  const content = 'Hello World';
  const filePath = path.join(tempDir, 'test.txt');
  fs.writeFileSync(filePath, content);
  const expectedSize = Buffer.byteLength(content, 'utf8');

  const size = await getFolderSize(tempDir);
  assert.equal(size, expectedSize, `Single file should return its exact byte size (${expectedSize})`);

  fs.unlinkSync(filePath);
  fs.rmdirSync(tempDir);
});

test('getFolderSize returns total size for nested directories', async () => {
  const tempDir = path.join(__dirname, 'temp_size_nested');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
  fs.mkdirSync(tempDir);
  fs.mkdirSync(path.join(tempDir, 'subdir'));

  const content1 = 'File one';
  const content2 = 'File two here';
  fs.writeFileSync(path.join(tempDir, 'file1.txt'), content1);
  fs.writeFileSync(path.join(tempDir, 'subdir', 'file2.txt'), content2);

  const expectedSize = Buffer.byteLength(content1, 'utf8') + Buffer.byteLength(content2, 'utf8');
  const size = await getFolderSize(tempDir);
  assert.equal(size, expectedSize, `Nested dirs should return total file size (${expectedSize})`);

  fs.rmSync(tempDir, { recursive: true });
});

test('getFolderSize returns total size for mixed files and subdirectories', async () => {
  const tempDir = path.join(__dirname, 'temp_size_mixed');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
  fs.mkdirSync(tempDir);
  fs.mkdirSync(path.join(tempDir, 'empty_subdir'));

  const contents = ['aaa', 'bbbbbb', 'ccccc'];
  fs.writeFileSync(path.join(tempDir, 'a.txt'), contents[0]);
  fs.writeFileSync(path.join(tempDir, 'b.txt'), contents[1]);
  fs.writeFileSync(path.join(tempDir, 'c.txt'), contents[2]);

  const expectedSize = contents.reduce((sum, c) => sum + Buffer.byteLength(c, 'utf8'), 0);
  const size = await getFolderSize(tempDir);
  assert.equal(size, expectedSize, `Mixed files should return sum of all file sizes`);

  fs.rmSync(tempDir, { recursive: true });
});

test('getFolderSize skips symbolic links to files', async () => {
  const tempDir = path.join(__dirname, 'temp_size_symlink');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
  fs.mkdirSync(tempDir);

  const realFile = path.join(tempDir, 'real.txt');
  const content = 'real content here';
  fs.writeFileSync(realFile, content);

  // Create a symlink to the real file
  const symlinkPath = path.join(tempDir, 'link.txt');
  fs.symlinkSync(realFile, symlinkPath);

  const expectedSize = Buffer.byteLength(content, 'utf8');
  const size = await getFolderSize(tempDir);

  // Symlink should be skipped (not followed), so size = only real file
  assert.equal(size, expectedSize, 'Symlink to file should be skipped');

  fs.unlinkSync(realFile);
  fs.unlinkSync(symlinkPath);
  fs.rmdirSync(tempDir);
});

test('getFolderSize skips unreadable directories gracefully', async () => {
  const tempDir = path.join(__dirname, 'temp_size_unreadable');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
  fs.mkdirSync(tempDir);
  fs.writeFileSync(path.join(tempDir, 'readable.txt'), 'hello');

  // Mock fs.promises.readdir to throw EACCES for the directory
  const originalReaddir = fs.promises.readdir.bind(fs.promises);
  fs.promises.readdir = async (...args) => {
    const dirPath = args[0];
    if (typeof dirPath === 'string' && dirPath.includes('temp_size_unreadable')) {
      const err = new Error('EACCES: permission denied');
      err.code = 'EACCES';
      throw err;
    }
    return originalReaddir(...args);
  };

  try {
    const size = await getFolderSize(tempDir);
    // Should return the partial size (the readable file at root level only)
    assert.equal(typeof size, 'number', 'Should return a number');
    assert.ok(size >= 0, 'Size should be non-negative');
  } finally {
    fs.promises.readdir = originalReaddir;
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  }
});

test('getFolderSize handles deeply nested directories', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'size_deep-'));
  // Create 5 levels of nesting
  let current = tempDir;
  for (let i = 1; i <= 5; i++) {
    current = path.join(current, `level${i}`);
    fs.mkdirSync(current);
    fs.writeFileSync(path.join(current, `file_l${i}.txt`), `content level ${i}`);
  }

  const expectedSize = [1, 2, 3, 4, 5].reduce(
    (sum, i) => sum + Buffer.byteLength(`content level ${i}`, 'utf8'),
    0
  );
  const size = await getFolderSize(tempDir);

  assert.equal(size, expectedSize, 'Deep nesting should return sum of all file sizes');

  fs.rmSync(tempDir, { recursive: true });
});
