export function parseDiff(diffStr) {
  const files = [];
  const binaryFiles = [];
  if (!diffStr || typeof diffStr !== 'string') {
    return { files, binaryFiles };
  }
  const lines = diffStr.split('\n');
  let currentFile = null;
  let currentLineInNewFile = 0;
  let currentLineInOldFile = 0;

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      const match = line.match(/b\/(.+)$/);
      if (match) {
        const rawPath = match[1];
        const cleanPath = rawPath.replace(/^"(.*)"$/, '$1');
        currentFile = {
          path: cleanPath,
          changes: [],
          deletions: []
        };
        files.push(currentFile);
      }
    } else if (line.startsWith('@@ ')) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        currentLineInOldFile = parseInt(match[1], 10);
        currentLineInNewFile = parseInt(match[2], 10);
      }
    } else if (line.startsWith('Binary files')) {
      if (currentFile) {
        binaryFiles.push(currentFile.path);
      }
    } else if (currentFile) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        currentFile.changes.push({
          line: currentLineInNewFile,
          content: line.slice(1)
        });
        currentLineInNewFile++;
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        currentFile.deletions.push({
          line: currentLineInOldFile,
          content: line.slice(1)
        });
        currentLineInOldFile++;
      } else if (line.startsWith(' ')) {
        currentLineInNewFile++;
        currentLineInOldFile++;
      }
    }
  }
  return { files, binaryFiles };
}

export function countLinesInDiff(files) {
  if (!Array.isArray(files)) return 0;
  return files.reduce((total, file) => {
    let count = 0;
    if (Array.isArray(file.changes)) count += file.changes.length;
    if (Array.isArray(file.deletions)) count += file.deletions.length;
    return total + count;
  }, 0);
}

export function getAllChanges(files) {
  const result = [];
  if (!Array.isArray(files)) return result;
  for (const file of files) {
    if (Array.isArray(file.changes)) {
      for (const c of file.changes) result.push({ ...c, file: file.path });
    }
    if (Array.isArray(file.deletions)) {
      for (const d of file.deletions) result.push({ ...d, file: file.path, deleted: true });
    }
  }
  return result;
}
