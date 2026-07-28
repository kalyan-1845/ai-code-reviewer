/**
 * diffParser.worker.js
 * ~~~~~~~~~~~~~~~~~~~~
 * Web Worker for CPU-heavy operations that would otherwise block the main
 * React render thread in the RepoSage dashboard.
 *
 * Supported message types (sent TO this worker):
 *   { type: 'PARSE_DIFF',    payload: string }          → raw git diff text
 *   { type: 'FLATTEN_TREE',  payload: { nodes, expandedPaths } }
 *
 * Response messages (posted FROM this worker):
 *   { type: 'DIFF_PARSED',   result: ParsedDiff }
 *   { type: 'TREE_FLATTENED', result: FlatNode[] }
 *   { type: 'ERROR',          error: string }
 *
 * @typedef {{ name: string, isFolder: boolean, fullPath: string, children: FileTreeNode[] }} FileTreeNode
 * @typedef {{ node: FileTreeNode, depth: number }} FlatNode
 * @typedef {{ header: string, lines: string[] }} DiffHunk
 * @typedef {{ name: string, hunks: DiffHunk[] }} ParsedFile
 * @typedef {{ files: ParsedFile[] }} ParsedDiff
 */

// ---------------------------------------------------------------------------
// PARSE_DIFF
// Splits a raw unified git diff blob into structured per-file hunks.
// This is O(n) on diff size and can be slow for large repos on the main thread.
// ---------------------------------------------------------------------------

/**
 * @param {string} rawDiff
 * @returns {ParsedDiff}
 */
function parseDiff(rawDiff) {
  if (!rawDiff || typeof rawDiff !== 'string') {
    return { files: [] };
  }

  const files = [];
  // Split on "diff --git" boundaries (keep the delimiter in each segment)
  const segments = rawDiff.split(/(?=^diff --git )/m).filter(Boolean);

  for (const segment of segments) {
    const lines = segment.split('\n');

    // Extract the file name from the "--- a/..." or "+++ b/..." header lines
    let name = '';
    for (const line of lines) {
      if (line.startsWith('+++ b/')) {
        name = line.slice(6).trim();
        break;
      }
      if (line.startsWith('+++ ')) {
        name = line.slice(4).trim();
        break;
      }
    }
    if (!name) {
      // Fallback: parse from "diff --git a/X b/X"
      const match = lines[0]?.match(/^diff --git a\/.+ b\/(.+)$/);
      name = match ? match[1] : 'unknown';
    }

    // Split into hunks on "@@ " boundaries
    const hunks = [];
    let currentHunk = null;

    for (const line of lines) {
      if (line.startsWith('@@ ')) {
        if (currentHunk) hunks.push(currentHunk);
        currentHunk = { header: line, lines: [] };
      } else if (currentHunk) {
        currentHunk.lines.push(line);
      }
    }
    if (currentHunk) hunks.push(currentHunk);

    files.push({ name, hunks });
  }

  return { files };
}

// ---------------------------------------------------------------------------
// FLATTEN_TREE
// Converts the nested FileTreeNode[] (with expanded state) into a flat
// ordered array for @tanstack/react-virtual. Doing this in a worker avoids
// recursive traversal on every render cycle when the tree is large.
// ---------------------------------------------------------------------------

/**
 * @param {FileTreeNode[]} nodes
 * @param {string[]} expandedPaths  - array of fullPath strings that are expanded
 * @param {number} depth
 * @param {FlatNode[]} result
 */
function flattenTree(nodes, expandedPaths, depth = 0, result = []) {
  const expandedSet = Array.isArray(expandedPaths)
    ? new Set(expandedPaths)
    : expandedPaths;

  for (const node of nodes) {
    result.push({ node, depth });
    if (node.isFolder && expandedSet.has(node.fullPath) && node.children?.length) {
      flattenTree(node.children, expandedSet, depth + 1, result);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------
self.onmessage = function (event) {
  const { type, payload } = event.data || {};

  try {
    if (type === 'PARSE_DIFF') {
      const result = parseDiff(payload);
      self.postMessage({ type: 'DIFF_PARSED', result });
      return;
    }

    if (type === 'FLATTEN_TREE') {
      const { nodes, expandedPaths } = payload || {};
      const result = flattenTree(nodes || [], expandedPaths || []);
      self.postMessage({ type: 'TREE_FLATTENED', result });
      return;
    }

    // Unknown message type — ignore silently
    self.postMessage({ type: 'ERROR', error: `Unknown message type: ${type}` });
  } catch (err) {
    self.postMessage({
      type: 'ERROR',
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
