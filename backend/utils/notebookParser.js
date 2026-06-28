// Parses Jupyter notebook (.ipynb) files and extracts code cells
import fs from 'fs';

export class NotebookParser {
  static MAGIC_COMMANDS_REGEX = /^%|^!/m;
  static MAGIC_PATTERNS = [
    /^%matplotlib.*$/m,
    /^%load_ext.*$/m,
    /^%timeit.*$/m,
    /^%%.*$/m,
    /^!pip.*$/m,
    /^!conda.*$/m,
  ];

  static extractCodeCells(notebookPath) {
    try {
      const content = fs.readFileSync(notebookPath, 'utf-8');
      const notebook = JSON.parse(content);

      if (!notebook.cells || !Array.isArray(notebook.cells)) {
        throw new Error('Invalid notebook structure: missing cells array');
      }

      return notebook.cells
        .filter((cell) => cell.cell_type === 'code' && cell.source)
        .map((cell, index) => ({
          cellIndex: index,
          source: Array.isArray(cell.source) ? cell.source.join('') : cell.source,
          language: 'python',
        }));
    } catch (err) {
      throw new Error(`Failed to parse notebook: ${err.message}`);
    }
  }

  static stripMagicCommands(code) {
    let stripped = code;

    // Remove magic commands
    this.MAGIC_PATTERNS.forEach((pattern) => {
      stripped = stripped.replace(pattern, '');
    });

    // Remove blank lines that result from magic command removal
    stripped = stripped.replace(/^\s*\n/gm, '');

    return stripped;
  }

  static parseCellsWithMetadata(notebookPath) {
    const cells = this.extractCodeCells(notebookPath);

    return cells.map((cell) => {
      const cleaned = this.stripMagicCommands(cell.source);

      return {
        cellIndex: cell.cellIndex,
        originalSource: cell.source,
        cleanedSource: cleaned,
        hasMagicCommands: cleaned.length !== cell.source.length,
        language: cell.language,
      };
    });
  }

  static formatFindingWithCellContext(finding, cellIndex) {
    return {
      ...finding,
      context: {
        cellIndex,
        cellDisplay: `Cell ${cellIndex + 1}`,
      },
      location: `${finding.file}:Cell ${cellIndex + 1}:${finding.line}`,
    };
  }

  static isNotebookFile(filePath) {
    return filePath.endsWith('.ipynb');
  }
}

export default NotebookParser;
