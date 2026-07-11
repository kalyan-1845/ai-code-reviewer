import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURE_PATH = path.join(__dirname, 'notebook.fixture.ipynb');
const ORIGINAL_READ_FILE_SYNC = fs.readFileSync;
const ORIGINAL_EXISTS_SYNC = fs.existsSync;

function withNotebookFixture(notebook, fn) {
  const content = JSON.stringify(notebook);
  fs.existsSync = (p) => p === FIXTURE_PATH ? true : ORIGINAL_EXISTS_SYNC(p);
  fs.readFileSync = (p) => p === FIXTURE_PATH ? content : ORIGINAL_READ_FILE_SYNC(p);
  try {
    return fn();
  } finally {
    fs.existsSync = ORIGINAL_EXISTS_SYNC;
    fs.readFileSync = ORIGINAL_READ_FILE_SYNC;
  }
}

import {
  stripMagicCommands,
  extractCodeCells,
  parseCellsWithMetadata,
  isNotebookFile,
  formatNotebookFindings,
} from '../utils/notebookParser.js';

test('notebookParser: stripMagicCommands removes %matplotlib magic commands', () => {
  const code = '%matplotlib inline\nimport numpy as np\n';
  const result = stripMagicCommands(code);
  assert.equal(result.includes('%matplotlib'), false, 'should remove %matplotlib');
  assert.ok(result.includes('import numpy as np'), 'should keep actual code');
});

test('notebookParser: stripMagicCommands removes %pylab magic commands', () => {
  const code = '%pylab inline\nimport matplotlib.pyplot as plt\n';
  const result = stripMagicCommands(code);
  assert.equal(result.includes('%pylab'), false);
  assert.ok(result.includes('import matplotlib.pyplot'));
});

test('notebookParser: stripMagicCommands removes %config magic commands', () => {
  const code = '%config InlineBackend.figure_format = "retina"\nplt.plot([1,2,3])\n';
  const result = stripMagicCommands(code);
  assert.equal(result.includes('%config'), false);
  assert.ok(result.includes('plt.plot'));
});

test('notebookParser: stripMagicCommands removes %%time cell magic', () => {
  const code = '%%time\nfor i in range(1000):\n    pass\n';
  const result = stripMagicCommands(code);
  assert.equal(result.includes('%%time'), false);
  assert.ok(result.includes('for i in range'));
});

test('notebookParser: stripMagicCommands removes %%capture cell magic line', () => {
  const code = '%%capture\nprint("captured")\n';
  const result = stripMagicCommands(code);
  assert.equal(result.includes('%%capture'), false, '%%capture should be removed');
  assert.ok(result.includes('print("captured")'), 'cell body should remain');
});

test('notebookParser: stripMagicCommands removes %%writefile cell magic', () => {
  const code = '%%writefile output.txt\nHello World\n';
  const result = stripMagicCommands(code);
  assert.equal(result.includes('%%writefile'), false);
});

test('notebookParser: stripMagicCommands removes %%sh and %%bash cell magic lines', () => {
  const code = '%%sh\nls -la\n';
  const result = stripMagicCommands(code);
  assert.equal(result.includes('%%sh'), false, '%%sh should be removed');
  assert.ok(result.includes('ls -la'), 'shell command should remain');

  const code2 = '%%bash\necho hello\n';
  const result2 = stripMagicCommands(code2);
  assert.equal(result2.includes('%%bash'), false, '%%bash should be removed');
  assert.ok(result2.includes('echo hello'), 'bash command should remain');
});

test('notebookParser: stripMagicCommands removes ! shell escape lines', () => {
  const code = '!pip install numpy\nimport numpy as np\n';
  const result = stripMagicCommands(code);
  assert.equal(result.includes('!pip'), false);
  assert.ok(result.includes('import numpy'));
});

test('notebookParser: stripMagicCommands removes bare % line magics', () => {
  const code = '%reset -f\n%time sum(range(100))\nimport os\n';
  const result = stripMagicCommands(code);
  assert.equal(result.includes('%reset'), false);
  assert.equal(result.includes('%time'), false);
  assert.ok(result.includes('import os'));
});

test('notebookParser: stripMagicCommands removes leading/trailing blank lines after stripping', () => {
  const code = '\n\n   \n!echo hello\n   \n\n';
  const result = stripMagicCommands(code);
  assert.equal(result.startsWith('\n'), false, 'should not start with newline');
  assert.equal(result.endsWith('\n'), false, 'should not end with newline');
});

test('notebookParser: extractCodeCells returns empty array for invalid notebook', () => {
  withNotebookFixture({ cells: null }, () => {
    const result = extractCodeCells(FIXTURE_PATH);
    assert.deepEqual(result, [], 'should return empty for invalid notebook');
  });
});

test('notebookParser: extractCodeCells returns empty array when cells is not an array', () => {
  withNotebookFixture({}, () => {
    const result = extractCodeCells(FIXTURE_PATH);
    assert.deepEqual(result, []);
  });
});

test('notebookParser: extractCodeCells returns only code cells with non-empty source', () => {
  const notebook = {
    cells: [
      { cell_type: 'markdown', source: '# Title' },
      { cell_type: 'code', source: 'print("hello")' },
      { cell_type: 'code', source: '' },
      { cell_type: 'code', source: '  \n  \n' },
      { cell_type: 'code', source: ['x = 1\n', 'y = 2\n'] },
      { cell_type: 'markdown', source: 'Another text cell' },
    ],
  };
  withNotebookFixture(notebook, () => {
    const result = extractCodeCells(FIXTURE_PATH);
    assert.equal(result.length, 2, 'should return 2 code cells with non-empty source');
    assert.equal(result[0], 'print("hello")');
    assert.equal(result[1], 'x = 1\ny = 2\n');
  });
});

test('notebookParser: parseCellsWithMetadata strips magic commands and tracks line counts', () => {
  const notebook = {
    cells: [
      {
        cell_type: 'code',
        source: '%matplotlib inline\nx = [1, 2, 3]\n',
      },
    ],
  };
  withNotebookFixture(notebook, () => {
    const result = parseCellsWithMetadata(FIXTURE_PATH);
    assert.equal(result.length, 1);
    assert.equal(result[0].cellIndex, 0);
    assert.equal(result[0].originalSource, '%matplotlib inline\nx = [1, 2, 3]\n');
    assert.ok(result[0].cleanedSource.includes('x = [1, 2, 3]'), 'cleaned source should have code');
    assert.ok(!result[0].cleanedSource.includes('%matplotlib'), 'cleaned source should not have magic');
    assert.ok(result[0].lineCount > 0, 'should have a line count');
  });
});

test('notebookParser: parseCellsWithMetadata skips empty cells after magic stripping', () => {
  const notebook = {
    cells: [
      { cell_type: 'code', source: '%matplotlib inline\n' },
      { cell_type: 'code', source: 'print("real code")\n' },
    ],
  };
  withNotebookFixture(notebook, () => {
    const result = parseCellsWithMetadata(FIXTURE_PATH);
    assert.equal(result.length, 1, 'only non-empty-after-stripping cell should be returned');
    assert.ok(result[0].cleanedSource.includes('print'));
  });
});

test('notebookParser: isNotebookFile returns true for .ipynb files', () => {
  assert.equal(isNotebookFile('notebook.ipynb'), true);
  assert.equal(isNotebookFile('path/to/file.ipynb'), true);
  assert.equal(isNotebookFile('NOTEBOOK.ipynb'), true);
});

test('notebookParser: isNotebookFile returns false for non-ipynb files', () => {
  assert.equal(isNotebookFile('script.py'), false);
  assert.equal(isNotebookFile('script.js'), false);
  assert.equal(isNotebookFile('notebook.py'), false);
  assert.equal(isNotebookFile('notebook.ipynb.txt'), false);
});

test('notebookParser: formatNotebookFindings adds cellContext to each finding', () => {
  const findings = [
    { file: 'cell.ipynb', line: 1, severity: 'error', message: 'Bug in cell' },
    { file: 'cell.ipynb', line: 5, severity: 'warning', message: 'Style issue' },
  ];
  const result = formatNotebookFindings(findings, 2);
  assert.equal(result.length, 2);
  assert.equal(result[0].cellContext, 'Cell 2');
  assert.equal(result[1].cellContext, 'Cell 2');
  assert.equal(result[0].message, 'Bug in cell', 'original fields preserved');
});
