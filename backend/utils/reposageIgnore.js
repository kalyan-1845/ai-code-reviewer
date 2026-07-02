import fs from 'fs';
import path from 'path';

/**
 * Parse a `.reposageignore` file and return an array of ignore patterns.
 * Supports simple glob matching (like .gitignore format):
 *   - Lines starting with # are comments
 *   - Blank lines are ignored
 *   - `*` matches any characters except `/`
 *   - `**` matches any characters including `/`
 *   - Trailing `/` means directory-only match
 */
function parseIgnoreFile(filePath) {
  if (!fs.existsSync(filePath)) return [];

  const content = fs.readFileSync(filePath, 'utf-8');
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('#'));
}

/**
 * Convert a glob pattern to a RegExp for matching file paths.
 */
function globToRegex(pattern) {
  const escaped = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '__DOUBLESTAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__DOUBLESTAR__/g, '.*');
  return new RegExp(`^${escaped}$`);
}

/**
 * Check if a file path should be ignored based on `.reposageignore` patterns.
 *
 * @param {string} filePath - Relative path to check (e.g., 'src/utils/helpers.js')
 * @param {string} repoRoot - Root directory of the cloned repository
 * @returns {boolean} true if the file should be ignored
 */
function shouldIgnore(filePath, repoRoot) {
  const ignoreFile = path.join(repoRoot, '.reposageignore');
  const patterns = parseIgnoreFile(ignoreFile);

  if (patterns.length === 0) return false;

  // Normalize path to forward slashes
  const normalizedPath = filePath.replace(/\\/g, '/');

  for (const pattern of patterns) {
    const regex = globToRegex(pattern);
    if (regex.test(normalizedPath)) {
      return true;
    }
    // Also match just the filename against the pattern
    const basename = path.basename(normalizedPath);
    if (regex.test(basename)) {
      return true;
    }
    // Check if any path segment matches a directory pattern (trailing /)
    if (pattern.endsWith('/')) {
      const dirPattern = pattern.slice(0, -1);
      const segments = normalizedPath.split('/');
      if (segments.some(seg => seg === dirPattern)) {
        return true;
      }
    }
  }

  return false;
}

export { parseIgnoreFile, shouldIgnore };
