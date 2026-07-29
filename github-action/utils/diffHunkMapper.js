/**
 * github-action/utils/diffHunkMapper.js
 * --------------------------------------
 * Utility for parsing git diff hunk headers and computing line-anchor offsets
 * between historical commit positions and current PR commit state.
 */

/**
 * Parse all diff hunks for files in a unified diff string.
 *
 * @param {string} diffStr
 * @returns {Map<string, Array<{ oldStart: number, oldLines: number, newStart: number, newLines: number, deletedOldLines: Set<number>, oldToNewMap: Map<number, number> }>>}
 */
export function parseHunksByFile(diffStr) {
  const fileHunks = new Map();
  if (!diffStr || typeof diffStr !== 'string') return fileHunks;

  const lines = diffStr.replace(/\r\n/g, '\n').split('\n');
  let currentFile = null;
  let currentHunks = [];
  let currentHunk = null;
  let currentOldLine = 0;
  let currentNewLine = 0;

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      const match = line.match(/^diff --git (?:".*?"|\S+) "?b\/(.+?)"?$/);
      if (match) {
        if (currentFile && currentHunks.length > 0) {
          fileHunks.set(currentFile, currentHunks);
        }
        currentFile = match[1];
        currentHunks = [];
        currentHunk = null;
      }
    } else if (line.startsWith('@@ ')) {
      const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      if (match && currentFile) {
        const oldStart = parseInt(match[1], 10);
        const oldLines = match[2] !== undefined ? parseInt(match[2], 10) : 1;
        const newStart = parseInt(match[3], 10);
        const newLines = match[4] !== undefined ? parseInt(match[4], 10) : 1;

        currentOldLine = oldStart;
        currentNewLine = newStart;

        currentHunk = {
          oldStart,
          oldLines,
          newStart,
          newLines,
          deletedOldLines: new Set(),
          oldToNewMap: new Map(),
          netShift: newLines - oldLines,
        };
        currentHunks.push(currentHunk);
      }
    } else if (currentHunk) {
      if (line.startsWith('-') && !line.startsWith('---')) {
        currentHunk.deletedOldLines.add(currentOldLine);
        currentOldLine++;
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        currentNewLine++;
      } else if (line.startsWith(' ')) {
        currentHunk.oldToNewMap.set(currentOldLine, currentNewLine);
        currentOldLine++;
        currentNewLine++;
      }
    }
  }

  if (currentFile && currentHunks.length > 0) {
    fileHunks.set(currentFile, currentHunks);
  }

  return fileHunks;
}

/**
 * Map a historical line number in a file to its current position after diff hunks.
 *
 * @param {string} diffStr  Full unified diff
 * @param {string} filePath File path
 * @param {number} oldLine  Original line number
 * @returns {{ newLine: number, isDeleted: boolean, isShifted: boolean, offset: number }}
 */
export function mapOldLineToNew(diffStr, filePath, oldLine) {
  if (!oldLine || typeof oldLine !== 'number') {
    return { newLine: oldLine, isDeleted: false, isShifted: false, offset: 0 };
  }

  const fileHunksMap = parseHunksByFile(diffStr);
  const hunks = fileHunksMap.get(filePath);

  if (!hunks || hunks.length === 0) {
    // File not modified in this diff -> line position unchanged
    return { newLine: oldLine, isDeleted: false, isShifted: false, offset: 0 };
  }

  let cumulativeShift = 0;

  for (const hunk of hunks) {
    // Case 1: oldLine is before this hunk
    if (oldLine < hunk.oldStart) {
      const mapped = oldLine + cumulativeShift;
      return {
        newLine: mapped,
        isDeleted: false,
        isShifted: cumulativeShift !== 0,
        offset: cumulativeShift,
      };
    }

    // Case 2: oldLine is inside this hunk's old range
    const oldEnd = hunk.oldStart + Math.max(0, hunk.oldLines - 1);
    if (oldLine >= hunk.oldStart && (hunk.oldLines === 0 || oldLine <= oldEnd)) {
      if (hunk.deletedOldLines.has(oldLine)) {
        return {
          newLine: hunk.newStart,
          isDeleted: true,
          isShifted: true,
          offset: cumulativeShift,
        };
      }
      if (hunk.oldToNewMap.has(oldLine)) {
        const mapped = hunk.oldToNewMap.get(oldLine);
        return {
          newLine: mapped,
          isDeleted: false,
          isShifted: mapped !== oldLine,
          offset: mapped - oldLine,
        };
      }
      // Fallback inside hunk
      return {
        newLine: hunk.newStart,
        isDeleted: false,
        isShifted: true,
        offset: hunk.netShift,
      };
    }

    // Case 3: oldLine is after this hunk
    cumulativeShift += hunk.netShift;
  }

  // After all hunks
  const mapped = oldLine + cumulativeShift;
  return {
    newLine: mapped,
    isDeleted: false,
    isShifted: cumulativeShift !== 0,
    offset: cumulativeShift,
  };
}
