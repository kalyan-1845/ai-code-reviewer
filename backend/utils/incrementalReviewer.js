import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import simpleGit from 'simple-git';
import { resolveSafePath } from './fileHelper.js';

const CACHE_FILENAME = '.codereview-cache.json';

function getCacheDir(repoPath) {
  const hash = crypto.createHash('sha256').update(repoPath).digest('hex').substring(0, 16);
  const cacheDir = path.join(os.tmpdir(), 'reposage-review-cache', hash);
  try { fs.mkdirSync(cacheDir, { recursive: true }); } catch {}
  return cacheDir;
}

function getFileContentHash(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch (err) {
    console.warn(`Failed to hash file ${filePath}: ${err.message}`);
    return null;
  }
}

function buildContentHashCache(files) {
  const cache = {};
  for (const file of files) {
    const hash = getFileContentHash(file);
    if (hash) {
      cache[file] = hash;
    }
  }
  return cache;
}

function loadCacheFile(cachePath) {
  const fullPath = path.join(getCacheDir(cachePath), CACHE_FILENAME);
  try {
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn(`Failed to load cache file at ${fullPath}: ${err.message}`);
  }
  return {};
}

function saveCacheFile(cachePath, cache) {
  const fullPath = path.join(getCacheDir(cachePath), CACHE_FILENAME);
  try {
    fs.writeFileSync(fullPath, JSON.stringify(cache, null, 2), 'utf-8');
  } catch (err) {
    console.warn(`Failed to save cache file at ${fullPath}: ${err.message}`);
  }
}

async function getChangedFiles(repoPath, baseRef = 'main') {
  try {
    const git = simpleGit(repoPath);
    const diffResult = await git.diff(['--name-only', baseRef, 'HEAD']);

    const changedFiles = diffResult
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => {
        try {
          return resolveSafePath(repoPath, line);
        } catch {
          return null;
        }
      })
      .filter(filePath => filePath !== null && fs.existsSync(filePath));

    return changedFiles;
  } catch (err) {
    console.warn(`Failed to get changed files from ${baseRef}: ${err.message}`);
    return [];
  }
}

function getFilesToReview(currentFiles, previousCache) {
  const filesToReview = [];
  const currentCache = buildContentHashCache(currentFiles);

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
  const previousCache = loadCacheFile(repoPath);
  const result = getFilesToReview(allFiles, previousCache);

  const summary = {
    incremental: true,
    baseRef,
    totalFilesInRepo: result.totalCount,
    filesChanged: result.changedCount,
    filesToReview: result.filesToReview,
    cacheHitCount: result.totalCount - result.changedCount,
    cacheStatus: 'active',
  };

  saveCacheFile(repoPath, result.currentCache);

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
