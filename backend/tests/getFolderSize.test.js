import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getFolderSize } from '../utils/fileHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('getFolderSize returns 0 for non-existent directory', () => {
  const size = getFolderSize('/non/existent/path/12345');
  assert.equal(size, 0, 'Non-existent path should return 0');
});

test('getFolderSize returns 0 for empty directory', () => {
  const tempDir = path.join(__dirname, 'temp_size_empty');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
  fs.mkdirSync(tempDir);

  const size = getFolderSize(tempDir);
  assert.equal(size, 0, 'Empty directory should return 0 bytes');

  fs.rmdirSync(tempDir);
});

test('getFolderSize returns exact size for single file', () => {
  const tempDir = path.join(__dirname, 'temp_size_single');
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
  fs.mkdirSync(tempDir);

  const content = 'Hello World';
  const filePath = path.join(tempDir, 'test.txt');
  fs.writeFileSync(filePath, content);
  const expectedSize = Buffer.byteLength(content, 'utf8');

  const size = getFolderSize(tempDir);
  assert.equal(size, expectedSize, `Single file should return its exact byte size (${expectedSize})`);

  fs.unlinkSync(filePath);
  fs.rmdirSync(tempDir);
});

test('getFolderSize returns total size for nested directories', () => {
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
  const size = getFolderSize(tempDir);
  assert.equal(size, expectedSize, `Nested dirs should return total file size (${expectedSize})`);

  fs.rmSync(tempDir, { recursive: true });
});

test('getFolderSize returns total size for mixed files and subdirectories', () => {
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
  const size = getFolderSize(tempDir);
  assert.equal(size, expectedSize, `Mixed files should return sum of all file sizes`);

  fs.rmSync(tempDir, { recursive: true });
});
