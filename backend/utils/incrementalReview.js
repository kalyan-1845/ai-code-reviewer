// Handles incremental code review for only changed files
import { execSync } from 'child_process';
import crypto from 'crypto';

export class IncrementalReviewer {
  constructor(repoPath = '.', baseRef = 'main') {
    this.repoPath = repoPath;
    this.baseRef = baseRef;
  }

  getChangedFiles(baseRef) {
    try {
      const result = execSync(`git -C ${this.repoPath} diff --name-only ${baseRef}`, {
        encoding: 'utf-8',
      });
      return result
        .split('\n')
        .filter((f) => f.trim())
        .filter((f) => /\.(py|js|ts|jsx|tsx)$/.test(f));
    } catch (err) {
      throw new Error(`Failed to get changed files: ${err.message}`);
    }
  }

  getFileContentHash(filePath) {
    try {
      const fs = require('fs');
      const content = fs.readFileSync(`${this.repoPath}/${filePath}`, 'utf-8');
      return crypto.createHash('sha256').update(content).digest('hex');
    } catch (err) {
      throw new Error(`Failed to read file ${filePath}: ${err.message}`);
    }
  }

  buildContentHashCache(files) {
    const cache = {};
    files.forEach((file) => {
      try {
        cache[file] = this.getFileContentHash(file);
      } catch (err) {
        console.error(`Error hashing ${file}:`, err.message);
      }
    });
    return cache;
  }

  loadCacheFile(cachePath) {
    try {
      const fs = require('fs');
      if (fs.existsSync(cachePath)) {
        return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
      }
    } catch (err) {
      console.warn(`Failed to load cache: ${err.message}`);
    }
    return {};
  }

  saveCacheFile(cachePath, cacheData) {
    try {
      const fs = require('fs');
      const path = require('path');
      const dir = path.dirname(cachePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2));
    } catch (err) {
      console.warn(`Failed to save cache: ${err.message}`);
    }
  }

  getFilesToReview(baseRef, cachePath = '.codereview-cache.json') {
    const changedFiles = this.getChangedFiles(baseRef);
    const currentHashes = this.buildContentHashCache(changedFiles);
    const previousHashes = this.loadCacheFile(cachePath);

    const filesToReview = changedFiles.filter((file) => currentHashes[file] !== previousHashes[file]);

    this.saveCacheFile(cachePath, currentHashes);

    return {
      filesToReview,
      totalChanged: changedFiles.length,
      needsReview: filesToReview.length,
      cached: changedFiles.length - filesToReview.length,
    };
  }
}

export default IncrementalReviewer;
