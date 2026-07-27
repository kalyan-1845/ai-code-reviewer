// Prepared for future use — not yet wired into the backend pipeline.
// Tests exist at backend/tests/repoReader*.test.js.
// Remove this notice when the first consumer import is added.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import simpleGit from 'simple-git';
import { isValidRepoUrl } from './urlValidator.js';
import { loadIgnorePatterns, isIgnored } from './ignoreHelper.js';
import { HARD_SKIP_DIRS } from './skipConstants.js';
import { deleteFolderRecursive, resolveSafePath } from './fileHelper.js';
import { getPullRequestDiff } from '../services/gitDeltaService.js';
import { buildDeltaReviewPrompt } from '../prompts/deltaReviewPrompt.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default file extensions when caller doesn't specify any.
// Kept intentionally small (3 languages) so the consumer can override.
const DEFAULT_EXTENSIONS = ['.js', '.py', '.ts'];

// Hard caps matching the rest of the repo's analyzers.
const DEFAULT_MAX_FILES = 500;
const DEFAULT_MAX_DEPTH = 10;
const DEFAULT_MAX_BYTES = 1024 * 1024; // 1 MB per file
const DEFAULT_CLONE_TIMEOUT_MS = 120000;

// Directories always skipped (shared with ignoreHelper.js#readFilesRecursively).

// Map file extension → language label, used by downstream chunkers.
// Mirrors the language map in ai-engine/text_splitter.py:20-33.
const EXTENSION_LANGUAGE = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.py': 'python',
  '.java': 'java',
  '.go': 'go',
  '.rs': 'rust',
  '.cpp': 'cpp',
  '.c': 'cpp',
  '.h': 'cpp',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.php': 'php',
  '.rb': 'ruby',
  '.sql': 'sql',
  '.html': 'html',
  '.css': 'css',
  '.json': 'json',
  '.md': 'markdown',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
};

/**
 * Internal tree walker. Honors hard-coded dir skips, .reposageignore, depth cap,
 * file count cap, and per-file byte cap. Skips files whose extension is not in
 * `extensionSet`. Symlinks are skipped to avoid symlink-loop DoS (matches
 * ignoreHelper.js).
 */
function walkForExtensions(rootDir, extensionSet, ignorePatterns, maxFiles, maxDepth, maxBytes) {
  const out = [];
  const stack = [{ dir: rootDir, depth: 0 }];

  while (stack.length > 0) {
    if (out.length >= maxFiles) break;
    const { dir, depth } = stack.pop();
    if (depth > maxDepth) continue;

    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }

    for (const name of entries) {
      if (out.length >= maxFiles) break;
      const full = path.join(dir, name);

      let stat;
      try {
        stat = fs.lstatSync(full);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) continue;

      if (stat.isDirectory()) {
        if (HARD_SKIP_DIRS.has(name)) continue;
        if (isIgnored(full, ignorePatterns, rootDir)) continue;
        stack.push({ dir: full, depth: depth + 1 });
        continue;
      }

      // It's a file. Skip .reposageignore itself, ignore-rule matches,
      // and anything outside the caller's extension allowlist.
      if (name === '.reposageignore') continue;
      if (isIgnored(full, ignorePatterns, rootDir)) continue;

      const ext = path.extname(name).toLowerCase();
      if (!extensionSet.has(ext)) continue;
      if (stat.size > maxBytes) continue;

      let content;
      try {
        const safePath = resolveSafePath(rootDir, full);
        content = fs.readFileSync(safePath, 'utf-8');
      } catch {
        continue;
      }
      out.push({
        path: path.relative(rootDir, full).replace(/\\/g, '/'),
        content,
        sizeBytes: stat.size,
        language: EXTENSION_LANGUAGE[ext] ?? 'unknown',
      });
    }
  }
  return out;
}

/**
 * Normalize an extensions array to lowercase, dot-prefixed.
 */
function normalizeExtensions(input) {
  const list = Array.isArray(input) ? input : DEFAULT_EXTENSIONS;
  return list.map((e) => {
    const lower = String(e).toLowerCase();
    return lower.startsWith('.') ? lower : `.${lower}`;
  });
}

/**
 * Pure helper for unit testing without hitting the network.
 * Walks a local directory and applies the same filter shape as the async entrypoint,
 * but does not clone.
 *
 * @param {string} localDir
 * @param {object} [options]
 * @returns {Array<{path: string, content: string, sizeBytes: number, language: string}>}
 */
export function readCodeFilesFromLocalDir(localDir, options = {}) {
  const extensions = normalizeExtensions(options.extensions);
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const extensionSet = new Set(extensions);
  const ignorePatterns = loadIgnorePatterns(localDir);
  return walkForExtensions(localDir, extensionSet, ignorePatterns, maxFiles, maxDepth, maxBytes);
}

/**
 * Clone a GitHub repository and return its code files as a JSON-serializable array.
 *
 * Output shape: `[{ path, content, sizeBytes, language }, ...]`
 * - `path` is relative to the repo root, using forward slashes
 * - `content` is the raw UTF-8 file contents
 * - `sizeBytes` is the on-disk size, useful for downstream chunking budgets
 * - `language` is a label derived from the extension; 'unknown' if not mapped
 *
 * The clone is always cleaned up, even on error.
 *
 * @param {string} repoUrl  HTTPS GitHub URL (validated against urlValidator rules)
 * @param {object} [options]
 * @param {string[]} [options.extensions=['.js','.py','.ts']]  Lower-case, dot-prefixed
 * @param {number}   [options.maxFiles=500]
 * @param {number}   [options.maxDepth=10]
 * @param {number}   [options.maxBytes=1048576]   Skip files larger than this
 * @param {number}   [options.cloneTimeoutMs=120000]
 * @param {object}   [options.webhookPr] Optional. { baseBranch, headBranch }. Triggers Delta Review mode.
 * @returns {Promise<Array<{path: string, content: string, sizeBytes: number, language: string}>>}
 */
export async function readCodeFilesFromRepo(repoUrl, options = {}) {
  if (!isValidRepoUrl(repoUrl)) {
    throw new Error(`Invalid GitHub repository URL: ${repoUrl}`);
  }

  const extensions = normalizeExtensions(options.extensions);
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const cloneTimeoutMs = options.cloneTimeoutMs ?? DEFAULT_CLONE_TIMEOUT_MS;
  const extensionSet = new Set(extensions);
  const isPrWebhook = !!options.webhookPr;

  // Stage the clone in the same temp dir the analyze flow uses, with a unique subdir
  // so concurrent callers don't collide. Always clean up via try/finally.
  const tempReposDir = path.join(__dirname, '..', 'temp_repos');
  if (!fs.existsSync(tempReposDir)) {
    fs.mkdirSync(tempReposDir, { recursive: true });
  }

  const uniqueId = crypto.randomUUID();
  const clonePath = path.join(tempReposDir, `rag_${uniqueId}`);

  try {
    const git = simpleGit({
      timeout: { block: cloneTimeoutMs },
      unsafe: {
        allowUnsafeHooksPath: true
      }
    });

    if (isPrWebhook) {
      await git.clone(repoUrl, clonePath, [
        '--config', 'core.hooksPath=/dev/null',
        '--no-checkout'
      ]);
      await git.cwd(clonePath).fetch(['origin', options.webhookPr.baseBranch]);
      await git.cwd(clonePath).fetch(['origin', options.webhookPr.headBranch]);
      
      const diffString = await getPullRequestDiff(clonePath, options.webhookPr.baseBranch, options.webhookPr.headBranch);
      const prompt = buildDeltaReviewPrompt(diffString);
      
      return [{
        path: 'pr_delta.patch',
        content: prompt,
        sizeBytes: Buffer.byteLength(prompt, 'utf8'),
        language: 'diff'
      }];
    } else {
      await git.clone(repoUrl, clonePath, [
        '--config', 'core.hooksPath=/dev/null',
        '--depth', '1',
        '--single-branch',
        '--no-checkout'
      ]);
      await git.cwd(clonePath).checkout(['HEAD']);

      const ignorePatterns = loadIgnorePatterns(clonePath);
      return walkForExtensions(
        clonePath,
        extensionSet,
        ignorePatterns,
        maxFiles,
        maxDepth,
        maxBytes
      );
    }
  } finally {
    deleteFolderRecursive(clonePath);
  }
}

// Re-export the cap constants so tests and consumers can introspect them.
export const REPO_READER_DEFAULTS = Object.freeze({
  extensions: DEFAULT_EXTENSIONS,
  maxFiles: DEFAULT_MAX_FILES,
  maxDepth: DEFAULT_MAX_DEPTH,
  maxBytes: DEFAULT_MAX_BYTES,
  cloneTimeoutMs: DEFAULT_CLONE_TIMEOUT_MS,
});