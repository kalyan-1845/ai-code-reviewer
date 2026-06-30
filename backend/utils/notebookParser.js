import fs from 'fs';

const MAGIC_COMMAND_REGEX = /^(%|!).*$/gm;
const IPYTHON_MAGIC_PATTERNS = [
  /^%matplotlib.*$/gm,
  /^%pylab.*$/gm,
  /^%config.*$/gm,
  /^%%time$/gm,
  /^%%timeit$/gm,
  /^%%capture.*$/gm,
  /^%%writefile.*$/gm,
  /^%%sh$/gm,
  /^%%bash$/gm,
  /^!.*$/gm,
];

function stripMagicCommands(code) {
  let cleanedCode = code;

  for (const pattern of IPYTHON_MAGIC_PATTERNS) {
    cleanedCode = cleanedCode.replace(pattern, '');
  }

  cleanedCode = cleanedCode.replace(MAGIC_COMMAND_REGEX, '');
  cleanedCode = cleanedCode.replace(/^\s*\n/gm, '');

  return cleanedCode.trim();
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
      if (cell.cell_type === 'code' && cell.source) {
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
      if (cell.cell_type === 'code' && cell.source) {
        let sourceCode = '';
        if (Array.isArray(cell.source)) {
          sourceCode = cell.source.join('');
        } else {
          sourceCode = String(cell.source);
        }

        if (sourceCode.trim().length > 0) {
          const cleanedCode = stripMagicCommands(sourceCode);

          if (cleanedCode.length > 0) {
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
  return filePath.endsWith('.ipynb');
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
