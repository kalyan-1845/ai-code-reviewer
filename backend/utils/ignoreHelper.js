import fs from 'fs';
import path from 'path';
import { HARD_SKIP_DIRS } from './skipConstants.js';

// 🟢 Helper to load .reposageignore patterns from a directory
export function loadIgnorePatterns(dir) {
  const patterns = [];
  const ignoreFile = path.join(dir, '.reposageignore');
  if (fs.existsSync(ignoreFile)) {
    const content = fs.readFileSync(ignoreFile, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        patterns.push(trimmed);
      }
    }
  }
  return patterns;
}

// 🟢 Helper to check if a path matches any ignore pattern
export function isIgnored(filePath, patterns, baseDir) {
  if (!patterns || !Array.isArray(patterns)) return false;
  const relative = path.relative(baseDir, filePath).replace(/\\/g, '/');
  for (const pattern of patterns) {
    if (typeof pattern !== 'string') continue;
    if (pattern.endsWith('/')) {
      if (relative === pattern.slice(0, -1) || relative.startsWith(pattern)) {
        return true;
      }
    } else if (pattern.startsWith('*.')) {
      if (relative.endsWith(pattern.slice(1))) {
        return true;
      }
    } else if (pattern.includes('*')) {
      const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
      try {
        if (new RegExp(`^${escaped}$`).test(relative)) return true;
      } catch { /* skip invalid pattern */ }
    } else {
      if (relative === pattern || relative.startsWith(pattern + '/')) {
        return true;
      }
    }
  }
  return false;
}

// 🟢 Helper to recursively read files
const MAX_DEPTH = 5;
const MAX_FILES = 200;
const MAX_FILE_SIZE = 100 * 1024;

export function readFilesRecursively(dir, fileList = [], baseDir = dir, ignorePatterns = [], depth = 0, skippedFiles = []) {
  if (depth > MAX_DEPTH) return fileList;
  if (fileList.length >= MAX_FILES) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (fileList.length >= MAX_FILES) return fileList;
    const filePath = path.join(dir, file);
    let stat;
    try {
      stat = fs.lstatSync(filePath);
    } catch {
      continue;
    }

    // Skip symlinks to avoid circular reference DoS
    if (stat.isSymbolicLink()) continue;

    // Skip directories that should never be analyzed
    if (HARD_SKIP_DIRS.has(file)) {
      continue;
    }

    // Skip .reposageignore itself and any ignored paths
    if (file === '.reposageignore' || isIgnored(filePath, ignorePatterns, baseDir)) {
      continue;
    }

    if (stat.isDirectory()) {
      try {
        const realPath = fs.realpathSync(filePath);
        const resolvedBase = fs.realpathSync(baseDir);
        if (realPath.startsWith(resolvedBase)) {
          readFilesRecursively(filePath, fileList, baseDir, ignorePatterns, depth + 1, skippedFiles);
        }
      } catch (e) {
        // Skip on error
      }
    } else {
      // Analyze only source code files (Python, JS, TS, HTML, CSS, Go, Rust, Java, C++, PHP, Ruby, SQL)
      const ext = path.extname(file).toLowerCase();
      const validExtensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go', '.rs', '.cpp', '.h', '.cs', '.php', '.rb', '.sql', '.html', '.css', '.json', '.yaml', '.yml'];
      
      if (validExtensions.includes(ext)) {
        try {
          const stat = fs.statSync(filePath);
          if (stat.size > MAX_FILE_SIZE) {
            skippedFiles.push({ name: path.relative(baseDir, filePath).replace(/\\/g, '/'), reason: 'File exceeds size limit of 100KB', size: stat.size });
            continue;
          }
          const MAX_FILE_CONTENT_LENGTH = 1024 * 1024;
          const content = fs.readFileSync(filePath, 'utf-8').slice(0, MAX_FILE_CONTENT_LENGTH);
          fileList.push({
            name: path.relative(baseDir, filePath).replace(/\\/g, '/'),
            content: content
          });
        } catch (e) {
          console.warn(`Could not read file: ${filePath}`, e.message);
        }
      }
    }
  }
  return fileList;
}
