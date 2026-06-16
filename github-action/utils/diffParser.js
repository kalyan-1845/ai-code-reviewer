export function parseDiff(diffStr) {
  const files = [];
  const lines = diffStr.split('\n');
  let currentFile = null;
  let currentLineInNewFile = 0;

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      const match = line.match(/b\/(.+)$/);
      if (match) {
        currentFile = {
          path: match[1],
          changes: []
        };
        files.push(currentFile);
      }
    } else if (line.startsWith('@@ ')) {
      const match = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        currentLineInNewFile = parseInt(match[1], 10);
      } else {
        console.warn(`Warning: Could not parse hunk header: ${line}`);
      }
    } else if (currentFile) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        currentFile.changes.push({
          line: currentLineInNewFile,
          content: line.slice(1)
        });
        currentLineInNewFile++;
      } else if (line.startsWith(' ')) {
        currentLineInNewFile++;
      }
    }
  }
  return files;
}
