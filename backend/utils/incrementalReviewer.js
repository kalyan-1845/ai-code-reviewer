import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import simpleGit from 'simple-git';
import { fsWithTimeout } from './fsTimeout.js';

const CACHE_FILENAME = '.codereview-cache.json';

const FS_TIMEOUT_INCR = parseInt(process.env.FS_TIMEOUT_INCR_MS || '15000', 10);

async function getCacheDir(repoPath) {
  const hash = crypto.createHash('sha256').update(repoPath).digest('hex').substring(0, 16);
  const cacheDir = path.join(os.tmpdir(), 'reposage-review-cache', hash);
  try { await fsWithTimeout.mkdir(cacheDir, { recursive: true }, FS_TIMEOUT_INCR); } catch {}
  return cacheDir;
}

async function getFileContentHash(filePath) {
  try {
    const content = await fsWithTimeout.readFile(filePath, 'utf-8', FS_TIMEOUT_INCR);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch (err) {
    console.warn(`Failed to hash file ${filePath}: ${err.message}`);
    return null;
  }
}

async function buildContentHashCache(files) {
  const cache = {};
  for (const file of files) {
    const hash = await getFileContentHash(file);
    if (hash) {
      cache[file] = hash;
    }
  }
  return cache;
}

async function loadCacheFile(cachePath) {
  const fullPath = path.join(await getCacheDir(cachePath), CACHE_FILENAME);
  try {
    try {
      await fsWithTimeout.access(fullPath, fs.constants.F_OK, FS_TIMEOUT_INCR);
    } catch {
      return {};
    }
    const content = await fsWithTimeout.readFile(fullPath, 'utf-8', FS_TIMEOUT_INCR);
    return JSON.parse(content);
  } catch (err) {
    console.warn(`Failed to load cache file at ${fullPath}: ${err.message}`);
  }
  return {};
}

async function saveCacheFile(cachePath, cache) {
  const fullPath = path.join(await getCacheDir(cachePath), CACHE_FILENAME);
  try {
    await fsWithTimeout.writeFile(fullPath, JSON.stringify(cache, null, 2), 'utf-8', FS_TIMEOUT_INCR);
  } catch (err) {
    console.warn(`Failed to save cache file at ${fullPath}: ${err.message}`);
  }
}

async function getChangedFiles(repoPath, baseRef = 'main') {
  try {
    const git = simpleGit(repoPath);
    const diffResult = await git.diff(['--name-only', baseRef, 'HEAD']);

    const changedFiles = [];
    for (const line of diffResult.split('\n')) {
      const filePath = path.join(repoPath, line);
      try {
        await fsWithTimeout.access(filePath, fs.constants.F_OK, FS_TIMEOUT_INCR);
        changedFiles.push(filePath);
      } catch {}
    }

    return changedFiles;
  } catch (err) {
    console.warn(`Failed to get changed files from ${baseRef}: ${err.message}`);
    return [];
  }
}

async function getFilesToReview(currentFiles, previousCache) {
  const filesToReview = [];
  const currentCache = await buildContentHashCache(currentFiles);

  for (const file of currentFiles) {
    const currentHash = currentCache[file];
    const previousHash = previousCache[file];

    if (!currentHash) {
      continue;
    }

    if (!previousHash || previousHash !== currentHash) {
      filesToReview.push(file);
    }
  }

  return {
    filesToReview,
    currentCache,
    changedCount: filesToReview.length,
    totalCount: currentFiles.length,
  };
}

async function analyzeIncremental(repoPath, baseRef = 'main', allFiles) {
  const previousCache = await loadCacheFile(repoPath);
  const result = await getFilesToReview(allFiles, previousCache);

  const summary = {
    incremental: true,
    baseRef,
    totalFilesInRepo: result.totalCount,
    filesChanged: result.changedCount,
    filesToReview: result.filesToReview,
    cacheHitCount: result.totalCount - result.changedCount,
    cacheStatus: 'active',
  };

  await saveCacheFile(repoPath, result.currentCache);

  return {
    ...summary,
    filesToReviewList: result.filesToReview,
  };
}

export {
  getFileContentHash,
  buildContentHashCache,
  loadCacheFile,
  saveCacheFile,
  getChangedFiles,
  getFilesToReview,
  analyzeIncremental,
  CACHE_FILENAME,
};
