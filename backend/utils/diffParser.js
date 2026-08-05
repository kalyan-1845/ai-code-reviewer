export function parseDiff(diffStr) {
  const files = [];
  const binaryFiles = [];
  if (!diffStr || typeof diffStr !== 'string') {
    return { files, binaryFiles };
  }
  const lines = diffStr.replace(/\r\n/g, '\n').split('\n');
  let currentFile = null;
  let currentLineInNewFile = 0;
  let currentLineInOldFile = 0;

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      const match = line.match(/^diff --git (?:".*?"|\S+) "?b\/(.+?)"?$/);
      if (match) {
        const cleanPath = match[1];
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
        if (!binaryFiles.includes(currentFile.path)) {
          binaryFiles.push(currentFile.path);
        }
        const idx = files.indexOf(currentFile);
        if (idx !== -1) {
          files.splice(idx, 1);
        }
        currentFile = null;
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
    if (!file) return total;
    let count = 0;
    if (Array.isArray(file.changes)) count += file.changes.filter(Boolean).length;
    if (Array.isArray(file.deletions)) count += file.deletions.filter(Boolean).length;
    return total + count;
  }, 0);
}

export function getAllChanges(files) {
  const result = [];
  if (!Array.isArray(files)) return result;
  for (const file of files) {
    if (!file) continue;
    if (Array.isArray(file.changes)) {
      for (const c of file.changes) if (c) result.push({ ...c, file: file.path });
    }
    if (Array.isArray(file.deletions)) {
      for (const d of file.deletions) if (d) result.push({ ...d, file: file.path, deleted: true });
    }
  }
  return result;
}
