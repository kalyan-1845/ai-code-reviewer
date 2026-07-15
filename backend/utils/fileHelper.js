import fs from 'fs';
import path from 'path';
import { fsWithTimeout } from './fsTimeout.js';

const FS_TIMEOUT_RM = parseInt(process.env.FS_TIMEOUT_RM_MS || '30000', 10);
const FS_TIMEOUT_STAT = parseInt(process.env.FS_TIMEOUT_STAT_MS || '15000', 10);
const FS_TIMEOUT_READDIR = parseInt(process.env.FS_TIMEOUT_READDIR_MS || '15000', 10);

export async function deleteFolderRecursive(directoryPath) {
  try {
    let isTopLevelSymlink = false;
    try {
      isTopLevelSymlink = (await fsWithTimeout.lstat(directoryPath, FS_TIMEOUT_STAT)).isSymbolicLink();
    } catch {
    }
    if (isTopLevelSymlink) {
      try {
        await fsWithTimeout.unlink(directoryPath, FS_TIMEOUT_STAT);
      } catch {
      }
      return;
    }
    try {
      await fsWithTimeout.access(directoryPath, fs.constants.F_OK, FS_TIMEOUT_STAT);
    } catch {
      return;
    }
    const entries = await fsWithTimeout.readdir(directoryPath, { withFileTypes: true }, FS_TIMEOUT_READDIR);
    for (const file of entries) {
      const curPath = path.join(directoryPath, file.name);
      let isSymlink = false;
      try {
        isSymlink = file.isSymbolicLink();
      } catch {
        try {
          await fsWithTimeout.unlink(curPath, FS_TIMEOUT_STAT);
        } catch {
        }
        continue;
      }
      if (isSymlink) {
        try {
          await fsWithTimeout.unlink(curPath, FS_TIMEOUT_STAT);
        } catch {
        }
        continue;
      }
      if (file.isFile()) {
        try {
          await fsWithTimeout.unlink(curPath, FS_TIMEOUT_STAT);
        } catch {
        }
      } else if (file.isDirectory()) {
        await deleteFolderRecursive(curPath);
      } else {
        try {
          await fsWithTimeout.unlink(curPath, FS_TIMEOUT_STAT);
        } catch {
        }
      }
    }
    await fsWithTimeout.rm(directoryPath, { recursive: true, force: true }, FS_TIMEOUT_RM);
  } catch (err) {
    console.warn(`deleteFolderRecursive: error with ${directoryPath}: ${err.message}`);
  }
}

export async function getFolderSize(dirPath) {
  let size = 0;
  try {
    const files = await fsWithTimeout.readdir(dirPath, { withFileTypes: true }, FS_TIMEOUT_READDIR);
    for (const file of files) {
      const filePath = path.join(dirPath, file.name);
      if (file.isDirectory() && !file.isSymbolicLink()) {
        size += await getFolderSize(filePath);
      } else if (!file.isSymbolicLink()) {
        const stats = await fsWithTimeout.stat(filePath, FS_TIMEOUT_STAT);
        size += stats.size;
      }
    }
  } catch (err) {
    console.warn(`getFolderSize: could not read path ${dirPath}: ${err.message}`);
  }
  return size;
}
