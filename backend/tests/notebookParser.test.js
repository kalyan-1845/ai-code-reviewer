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

test('notebookParser: stripMagicCommands comments out %matplotlib magic commands', () => {
  const code = '%matplotlib inline\nimport numpy as np\n';
  const result = stripMagicCommands(code);
  assert.ok(result.includes('# %matplotlib inline'), 'should comment out %matplotlib');
  assert.ok(result.includes('import numpy as np'), 'should keep actual code');
});

test('notebookParser: stripMagicCommands comments out %pylab magic commands', () => {
  const code = '%pylab inline\nimport matplotlib.pyplot as plt\n';
  const result = stripMagicCommands(code);
  assert.ok(result.includes('# %pylab inline'));
  assert.ok(result.includes('import matplotlib.pyplot'));
});

test('notebookParser: stripMagicCommands comments out %config magic commands', () => {
  const code = '%config InlineBackend.figure_format = "retina"\nplt.plot([1,2,3])\n';
  const result = stripMagicCommands(code);
  assert.ok(result.includes('# %config InlineBackend.figure_format'));
  assert.ok(result.includes('plt.plot'));
});

test('notebookParser: stripMagicCommands comments out %%time cell magic', () => {
  const code = '%%time\nfor i in range(1000):\n    pass\n';
  const result = stripMagicCommands(code);
  assert.ok(result.includes('# %%time'));
  assert.ok(result.includes('for i in range'));
});

test('notebookParser: stripMagicCommands comments out %%capture cell magic line', () => {
  const code = '%%capture\nprint("captured")\n';
  const result = stripMagicCommands(code);
  assert.ok(result.includes('# %%capture'), '%%capture should be commented out');
  assert.ok(result.includes('print("captured")'), 'cell body should remain');
});

test('notebookParser: stripMagicCommands comments out %%writefile cell magic', () => {
  const code = '%%writefile output.txt\nHello World\n';
  const result = stripMagicCommands(code);
  assert.ok(result.includes('# %%writefile output.txt'));
});

test('notebookParser: stripMagicCommands comments out %%sh and %%bash cell magic lines', () => {
  const code = '%%sh\nls -la\n';
  const result = stripMagicCommands(code);
  assert.ok(result.includes('# %%sh'), '%%sh should be commented out');
  assert.ok(result.includes('ls -la'), 'shell command should remain');

  const code2 = '%%bash\necho hello\n';
  const result2 = stripMagicCommands(code2);
  assert.ok(result2.includes('# %%bash'), '%%bash should be commented out');
  assert.ok(result2.includes('echo hello'), 'bash command should remain');
});

test('notebookParser: stripMagicCommands comments out ! shell escape lines', () => {
  const code = '!pip install numpy\nimport numpy as np\n';
  const result = stripMagicCommands(code);
  assert.ok(result.includes('# !pip install numpy'));
  assert.ok(result.includes('import numpy'));
});

test('notebookParser: stripMagicCommands comments out bare % line magics', () => {
  const code = '%reset -f\n%time sum(range(100))\nimport os\n';
  const result = stripMagicCommands(code);
  assert.ok(result.includes('# %reset -f'));
  assert.ok(result.includes('# %time sum(range(100))'));
  assert.ok(result.includes('import os'));
});

test('notebookParser: stripMagicCommands preserves exact line count mapping', () => {
  const code = '\n\n   \n!echo hello\n   \n\n';
  const result = stripMagicCommands(code);
  assert.equal(result.split('\n').length, 7, 'line count should be exactly preserved');
  assert.ok(result.includes('# !echo hello'));
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
    assert.ok(result[0].cleanedSource.includes('# %matplotlib'), 'cleaned source should comment out magic');
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
  assert.equal(isNotebookFile('notebook.IPYNB'), true);
});

test('notebookParser: isNotebookFile returns false for non-ipynb files', () => {
  assert.equal(isNotebookFile('script.py'), false);
  assert.equal(isNotebookFile('script.js'), false);
  assert.equal(isNotebookFile('notebook.py'), false);
  assert.equal(isNotebookFile('notebook.ipynb.txt'), false);
  assert.equal(isNotebookFile(null), false);
  assert.equal(isNotebookFile(undefined), false);
  assert.equal(isNotebookFile(123), false);
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

test('notebookParser: stripMagicCommands removes indented magics but preserves %s format specifiers', () => {
  const code = '  %matplotlib inline\n%s FROM users\n  !ls -la';
  const result = stripMagicCommands(code);
  assert.equal(result, '  # %matplotlib inline\n%s FROM users\n  # !ls -la');
});
