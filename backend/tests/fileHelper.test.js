import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { deleteFolderRecursive } from '../utils/fileHelper.js';

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

test('deleteFolderRecursive should delete nested directories and files correctly', async () => {
  const tempDir = path.join(__dirname, 'temp_test_delete');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir);
  }

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

test('deleteFolderRecursive skips valid symlinks without following them', { skip: !canCreateSymlinks }, () => {
  // Create a real external directory as the symlink target
  const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'symlink-external-'));
  const safeFile = path.join(externalDir, 'safe_file.txt');
  fs.writeFileSync(safeFile, 'must not be deleted');

  // Create a directory tree inside temp space
  const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'symlink-parent-'));
  const subDir = path.join(parentDir, 'sub');
  fs.mkdirSync(subDir);
  fs.writeFileSync(path.join(subDir, 'regular.txt'), 'delete this');
  // Create a symlink inside subDir pointing to externalDir
  const symlinkPath = path.join(subDir, 'external_link');
  fs.symlinkSync(externalDir, symlinkPath);

  assert.equal(fs.lstatSync(symlinkPath).isSymbolicLink(), true);

  deleteFolderRecursive(parentDir);

  // The parent tree must be gone
  assert.equal(fs.existsSync(parentDir), false);
  // The external target directory must still exist (symlink was not followed)
  assert.ok(fs.statSync(externalDir).isDirectory(), 'external target should still be a directory');
  assert.equal(fs.readFileSync(safeFile, 'utf8'), 'must not be deleted');

  // Cleanup external directory
  fs.unlinkSync(safeFile);
  fs.rmdirSync(externalDir);
});

test('deleteFolderRecursive skips broken symlinks without throwing', { skip: !canCreateSymlinks }, () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'broken_symlink_test-'));
  const brokenLink = path.join(tempDir, 'broken_link');
  // symlink to nonexistent target
  fs.symlinkSync('/this/path/does/not/exist', brokenLink);

  assert.equal(fs.lstatSync(brokenLink).isSymbolicLink(), true);

  assert.doesNotThrow(() => {
    deleteFolderRecursive(tempDir);
  });

  // Directory is removed (broken symlink was skipped without error)
  assert.equal(fs.existsSync(tempDir), false);
});

test('deleteFolderRecursive continues without throwing when rmdirSync raises EPERM', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'perm_error_test-'));
  const protectedSub = path.join(tempDir, 'protected');
  fs.mkdirSync(protectedSub);
  fs.writeFileSync(path.join(protectedSub, 'file.txt'), 'data');
  fs.writeFileSync(path.join(tempDir, 'open_file.txt'), 'open');

  const originalRmdirSync = fs.rmdirSync.bind(fs);
  fs.rmdirSync = (targetPath) => {
    if (typeof targetPath === 'string' && targetPath.includes('protected')) {
      const err = new Error('EPERM: permission denied');
      err.code = 'EPERM';
      throw err;
    }
    return originalRmdirSync(targetPath);
  };

  try {
    assert.doesNotThrow(() => {
      deleteFolderRecursive(tempDir);
    });
  } finally {
    fs.rmdirSync = originalRmdirSync;
    if (fs.existsSync(tempDir)) {
      deleteFolderRecursive(tempDir);
    }
  }
});

test('deleteFolderRecursive continues without throwing when unlinkSync raises EACCES', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unlink_error_test-'));
  const lockedFile = path.join(tempDir, 'locked.txt');
  fs.writeFileSync(lockedFile, 'locked content');
  fs.writeFileSync(path.join(tempDir, 'open.txt'), 'open');

  const originalUnlinkSync = fs.unlinkSync.bind(fs);
  fs.unlinkSync = (targetPath) => {
    if (typeof targetPath === 'string' && targetPath.includes('locked.txt')) {
      const err = new Error('EACCES: permission denied');
      err.code = 'EACCES';
      throw err;
    }
    return originalUnlinkSync(targetPath);
  };

  try {
    assert.doesNotThrow(() => {
      deleteFolderRecursive(tempDir);
    });
  } finally {
    fs.unlinkSync = originalUnlinkSync;
    if (fs.existsSync(tempDir)) {
      deleteFolderRecursive(tempDir);
    }
  }
});
