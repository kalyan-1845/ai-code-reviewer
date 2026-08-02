// Prepared for future use — not yet wired into the backend pipeline.
// Remove this notice when the first consumer import is added.

import fs from 'fs';

const MAGIC_COMMAND_REGEX = /^[ \t]*(%[a-zA-Z_][a-zA-Z0-9_]+|!).*$/gm;
const IPYTHON_MAGIC_PATTERNS = [
  /^[ \t]*%matplotlib.*$/gm,
  /^[ \t]*%pylab.*$/gm,
  /^[ \t]*%config.*$/gm,
  /^[ \t]*%%time$/gm,
  /^[ \t]*%%timeit$/gm,
  /^[ \t]*%%capture.*$/gm,
  /^[ \t]*%%writefile.*$/gm,
  /^[ \t]*%%sh$/gm,
  /^[ \t]*%%bash$/gm,
  /^[ \t]*!.*$/gm,
];

function stripMagicCommands(code) {
  if (typeof code !== 'string') return '';
  const lines = code.split('\n');
  const cleanedLines = lines.map(line => {
    const trimmed = line.trim();
    // Exclude single-char formats like %s by requiring at least 2 chars after % for magics
    const isMagic = /^(?:%{1,2}[a-zA-Z_][a-zA-Z0-9_]+|!).*$/.test(trimmed);
    if (isMagic) {
      // Preserve indentation but comment it out to keep line numbers intact
      return line.replace(/^([ \t]*)/, '$1# ');
    }
    return line;
  });
  return cleanedLines.join('\n');
}

function extractCodeCells(notebookPath) {
  try {
    const content = fs.readFileSync(notebookPath, 'utf-8');
    const notebook = JSON.parse(content);

    if (!notebook.cells || !Array.isArray(notebook.cells)) {
      console.warn(`Invalid notebook format in ${notebookPath}: no cells array`);
      return [];
    }

    const codeCells = [];
    for (const cell of notebook.cells) {
      if (cell && cell.cell_type === 'code' && cell.source) {
        let sourceCode = '';
        if (Array.isArray(cell.source)) {
          sourceCode = cell.source.join('');
        } else {
          sourceCode = String(cell.source);
        }

        if (sourceCode.trim().length > 0) {
          codeCells.push(sourceCode);
        }
      }
    }

    return codeCells;
  } catch (err) {
    console.warn(`Failed to parse notebook ${notebookPath}: ${err.message}`);
    return [];
  }
}

function hasCodeContent(cleanedCode) {
  const lines = cleanedCode.split('\n');
  return lines.some(line => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.startsWith('#');
  });
}

function parseCellsWithMetadata(notebookPath) {
  try {
    const content = fs.readFileSync(notebookPath, 'utf-8');
    const notebook = JSON.parse(content);

    if (!notebook.cells || !Array.isArray(notebook.cells)) {
      return [];
    }

    const cellsWithMetadata = [];
    let cellIndex = 0;

    for (const cell of notebook.cells) {
      if (cell && cell.cell_type === 'code' && cell.source) {
        let sourceCode = '';
        if (Array.isArray(cell.source)) {
          sourceCode = cell.source.join('');
        } else {
          sourceCode = String(cell.source);
        }

        if (sourceCode.trim().length > 0) {
          const cleanedCode = stripMagicCommands(sourceCode);

          if (hasCodeContent(cleanedCode)) {
            cellsWithMetadata.push({
              cellIndex,
              originalSource: sourceCode,
              cleanedSource: cleanedCode,
              lineCount: cleanedCode.split('\n').length,
            });
            cellIndex++;
          }
        }
      }
    }

    return cellsWithMetadata;
  } catch (err) {
    console.warn(`Failed to parse cells with metadata from ${notebookPath}: ${err.message}`);
    return [];
  }
}

function isNotebookFile(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  return filePath.toLowerCase().endsWith('.ipynb');
}

function formatNotebookFindings(findings, cellIndex) {
  return findings.map(finding => ({
    ...finding,
    cellContext: `Cell ${cellIndex}`,
  }));
}

export {
  stripMagicCommands,
  extractCodeCells,
  parseCellsWithMetadata,
  isNotebookFile,
  formatNotebookFindings,
};
