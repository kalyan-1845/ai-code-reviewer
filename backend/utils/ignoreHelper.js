import fs from 'fs';
import path from 'path';
import { HARD_SKIP_DIRS } from './skipConstants.js';
import { fsWithTimeout } from './fsTimeout.js';

// 🟢 Shebang → language map for extensionless scripts (e.g. a file named
// `deploy` starting with `#!/usr/bin/env python3`). Extension-based detection
// alone treats these as unsupported and silently drops them from analysis,
// so a shebang-based fallback is used for files with no extension.
const SHEBANG_LANGUAGE_PATTERNS = [
  { pattern: /^#!.*\bpython[0-9.]*\b/, language: 'python' },
  { pattern: /^#!.*\bnode\b/, language: 'javascript' },
  { pattern: /^#!.*\b(bash|sh|zsh|dash)\b/, language: 'shell' },
  { pattern: /^#!.*\bruby\b/, language: 'ruby' },
  { pattern: /^#!.*\bperl\b/, language: 'perl' },
  { pattern: /^#!.*\bphp\b/, language: 'php' },
];

// 🟢 Helper to detect a scripting language from a file's shebang line.
// Returns the detected language string, or null if no shebang/no match.
// Only inspects the first line — cheap and safe for arbitrarily large files.
export function detectShebangLanguage(content) {
  if (typeof content !== 'string' || !content.startsWith('#!')) return null;
  const newlineIndex = content.indexOf('\n');
  const firstLine = newlineIndex === -1 ? content : content.slice(0, newlineIndex);
  for (const { pattern, language } of SHEBANG_LANGUAGE_PATTERNS) {
    if (pattern.test(firstLine)) return language;
  }
  return null;
}

const FS_TIMEOUT_READ = parseInt(process.env.FS_TIMEOUT_READ_MS || '15000', 10);
const FS_TIMEOUT_STAT = parseInt(process.env.FS_TIMEOUT_STAT_MS || '10000', 10);
const FS_TIMEOUT_READDIR = parseInt(process.env.FS_TIMEOUT_READDIR_MS || '15000', 10);

export async function loadIgnorePatterns(dir) {
  const patterns = [];
  const ignoreFile = path.join(dir, '.reposageignore');
  try {
    await fsWithTimeout.access(ignoreFile, fs.constants.F_OK, FS_TIMEOUT_STAT);
    const content = await fsWithTimeout.readFile(ignoreFile, 'utf-8', FS_TIMEOUT_READ);
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        patterns.push(trimmed);
      }
    }
  } catch {
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
      // Convert glob to regex. Handle `**` (matches across any number of
      // directories, including `/`) correctly: split on `**` first, replace
      // any single `*` within the segments with `[^/]*`, then join the
      // segments with `.*` so globstar crosses directory boundaries.
      const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .split('**')
        .map(part => part.split('*').join('[^/]*'))
        .join('.*')
        .replace(/^\.\*\//, '(?:.*/)?');
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

const MAX_DEPTH = 5;
const MAX_FILES = 200;
const MAX_FILE_SIZE = 100 * 1024;

export async function readFilesRecursively(dir, fileList = [], baseDir = dir, ignorePatterns = [], depth = 0, skippedFiles = []) {
  if (depth > MAX_DEPTH) return fileList;
  if (fileList.length >= MAX_FILES) return fileList;
  let files;
  try {
    files = await fsWithTimeout.readdir(dir, FS_TIMEOUT_READDIR);
  } catch {
    return fileList;
  }
  for (const file of files) {
    if (fileList.length >= MAX_FILES) return fileList;
    const filePath = path.join(dir, file);
    let stat;
    try {
      stat = await fsWithTimeout.lstat(filePath, FS_TIMEOUT_STAT);
    } catch {
      continue;
    }

    if (stat.isSymbolicLink()) continue;

    if (HARD_SKIP_DIRS.has(file)) {
      continue;
    }

    if (file === '.reposageignore' || isIgnored(filePath, ignorePatterns, baseDir)) {
      continue;
    }

    if (stat.isDirectory()) {
      try {
        const realPath = await fsWithTimeout.realpath(filePath, FS_TIMEOUT_STAT);
        const resolvedBase = await fsWithTimeout.realpath(baseDir, FS_TIMEOUT_STAT);
        if (realPath.startsWith(resolvedBase)) {
          await readFilesRecursively(filePath, fileList, baseDir, ignorePatterns, depth + 1, skippedFiles);
        }
      } catch (e) {
      }
    } else {
      const ext = path.extname(file).toLowerCase();
      const validExtensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go', '.rs', '.cpp', '.h', '.cs', '.php', '.rb', '.sql', '.html', '.css', '.json', '.yaml', '.yml'];

      const isExtensionless = ext === '';

      if (validExtensions.includes(ext) || isExtensionless) {
        try {
          const fileStat = await fsWithTimeout.stat(filePath, FS_TIMEOUT_STAT);
          if (fileStat.size > MAX_FILE_SIZE) {
            if (validExtensions.includes(ext)) {
              skippedFiles.push({ name: path.relative(baseDir, filePath).replace(/\\/g, '/'), reason: 'File exceeds size limit of 100KB', size: fileStat.size });
            }
            continue;
          }
          const MAX_FILE_CONTENT_LENGTH = 1024 * 1024;
          const content = (await fsWithTimeout.readFile(filePath, 'utf-8', FS_TIMEOUT_READ)).slice(0, MAX_FILE_CONTENT_LENGTH);

          if (isExtensionless) {
            const detectedLanguage = detectShebangLanguage(content);
            if (!detectedLanguage) continue;
            fileList.push({
              name: path.relative(baseDir, filePath).replace(/\\/g, '/'),
              content: content,
              detectedLanguage,
            });
            continue;
          }

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
