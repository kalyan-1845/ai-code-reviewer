import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { deleteFolderRecursive } from '../utils/fileHelper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('deleteFolderRecursive should delete nested directories and files correctly', () => {
  const tempDir = path.join(__dirname, 'temp_test_delete');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

  // Create nesting
  const nestedDir = path.join(tempDir, 'nested');
  fs.mkdirSync(nestedDir);
  fs.writeFileSync(path.join(nestedDir, 'file.txt'), 'hello');
  fs.writeFileSync(path.join(tempDir, 'top.txt'), 'world');

  assert.equal(fs.existsSync(tempDir), true);

  deleteFolderRecursive(tempDir);

  assert.equal(fs.existsSync(tempDir), false);
});

test('deleteFolderRecursive should not throw if directory does not exist', () => {
  const nonExistentDir = path.join(__dirname, 'does_not_exist_folder');
  assert.doesNotThrow(() => {
    deleteFolderRecursive(nonExistentDir);
  });
});
