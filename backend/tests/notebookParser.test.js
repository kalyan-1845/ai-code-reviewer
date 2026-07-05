import test from 'node:test';
import assert from 'node:assert/strict';

const originalWarn = console.warn;
console.warn = () => {};

test('stripMagicCommands removes %matplotlib magic', async () => {
  const { stripMagicCommands } = await import('../utils/notebookParser.js');
  const result = stripMagicCommands('%matplotlib inline\nprint("hello")');
  assert.ok(!result.includes('%matplotlib'));
  assert.ok(result.includes('print("hello")'));
});

test('stripMagicCommands removes %pylab magic', async () => {
  const { stripMagicCommands } = await import('../utils/notebookParser.js');
  const result = stripMagicCommands('%pylab inline\nx = 1');
  assert.ok(!result.includes('%pylab'));
});

test('stripMagicCommands removes %config magic', async () => {
  const { stripMagicCommands } = await import('../utils/notebookParser.js');
  const result = stripMagicCommands('%config InlineBackend.figure_format = "retina"\nx = 1');
  assert.ok(!result.includes('%config'));
});

test('stripMagicCommands removes %%time magic', async () => {
  const { stripMagicCommands } = await import('../utils/notebookParser.js');
  const result = stripMagicCommands('%%time\nsum(range(1000))');
  assert.ok(!result.includes('%%time'));
});

test('stripMagicCommands removes %%timeit magic', async () => {
  const { stripMagicCommands } = await import('../utils/notebookParser.js');
  const result = stripMagicCommands('%%timeit -n 10\nsum(range(1000))');
  assert.ok(!result.includes('%%timeit'));
});

test('stripMagicCommands removes %%capture magic', async () => {
  const { stripMagicCommands } = await import('../utils/notebookParser.js');
  const result = stripMagicCommands('%%capture output\nprint("captured")');
  assert.ok(!result.includes('%%capture'));
});

test('stripMagicCommands removes %%writefile magic', async () => {
  const { stripMagicCommands } = await import('../utils/notebookParser.js');
  const result = stripMagicCommands('%%writefile data.txt\nhello world');
  assert.ok(!result.includes('%%writefile'));
});

test('stripMagicCommands removes shell escape ! commands', async () => {
  const { stripMagicCommands } = await import('../utils/notebookParser.js');
  const result = stripMagicCommands('!pip install numpy\nimport numpy as np');
  assert.ok(!result.includes('!pip'));
});

test('stripMagicCommands removes standalone % magic commands', async () => {
  const { stripMagicCommands } = await import('../utils/notebookParser.js');
  const result = stripMagicCommands('%who_ls\nx = 1\n%reset');
  assert.ok(!result.includes('%who_ls'));
  assert.ok(!result.includes('%reset'));
});

test('stripMagicCommands removes empty lines after magic removal', async () => {
  const { stripMagicCommands } = await import('../utils/notebookParser.js');
  const result = stripMagicCommands('!pip install\n\n\nprint("done")');
  assert.ok(!result.includes('\n\n\n'));
});

test('stripMagicCommands trims trailing whitespace', async () => {
  const { stripMagicCommands } = await import('../utils/notebookParser.js');
  const result = stripMagicCommands('!ls\n   \n   ');
  assert.strictEqual(result.trimEnd(), result);
});

test('stripMagicCommands passes through plain code unchanged', async () => {
  const { stripMagicCommands } = await import('../utils/notebookParser.js');
  const code = 'def hello():\n    print("world")';
  assert.strictEqual(stripMagicCommands(code), code);
});

test('stripMagicCommands handles empty string', async () => {
  const { stripMagicCommands } = await import('../utils/notebookParser.js');
  assert.strictEqual(stripMagicCommands(''), '');
});

test('stripMagicCommands removes %%sh and %%bash magic', async () => {
  const { stripMagicCommands } = await import('../utils/notebookParser.js');
  const result = stripMagicCommands('%%sh\nls -la\npwd');
  assert.ok(!result.includes('%%sh'));
  const result2 = stripMagicCommands('%%bash\necho hello');
  assert.ok(!result2.includes('%%bash'));
});

test('stripMagicCommands removes %%bash magic', async () => {
  const { stripMagicCommands } = await import('../utils/notebookParser.js');
  const result = stripMagicCommands('%%bash\necho hello');
  assert.ok(!result.includes('%%bash'));
});

test('isNotebookFile returns true for .ipynb files', async () => {
  const { isNotebookFile } = await import('../utils/notebookParser.js');
  assert.strictEqual(isNotebookFile('notebook.ipynb'), true);
  assert.strictEqual(isNotebookFile('path/to/data.ipynb'), true);
});

test('isNotebookFile returns false for non-notebook files', async () => {
  const { isNotebookFile } = await import('../utils/notebookParser.js');
  assert.strictEqual(isNotebookFile('script.py'), false);
  assert.strictEqual(isNotebookFile('data.txt'), false);
  assert.strictEqual(isNotebookFile('notebook.py'), false);
});

test('formatNotebookFindings adds cellContext to each finding', async () => {
  const { formatNotebookFindings } = await import('../utils/notebookParser.js');
  const findings = [{ line: 1, type: 'secret' }, { line: 5, type: 'secret' }];
  const result = formatNotebookFindings(findings, 2);
  assert.strictEqual(result[0].cellContext, 'Cell 2');
  assert.strictEqual(result[1].cellContext, 'Cell 2');
  assert.strictEqual(result.length, 2);
});

console.warn = originalWarn;

test('extractCodeCells returns code cells from valid notebook', async () => {
  const { extractCodeCells } = await import('../utils/notebookParser.js');
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');
  const tmpDir = await os.tmpdir();
  const tmpFile = path.join(tmpDir, 'test_notebook_' + Date.now() + '.ipynb');

  const notebook = {
    cells: [
      { cell_type: 'markdown', source: '# Title' },
      { cell_type: 'code', source: 'x = 1' },
      { cell_type: 'code', source: ['y = 2\n', 'z = 3'] },
      { cell_type: 'markdown', source: '## Section' },
      { cell_type: 'code', source: '' },
    ]
  };
  fs.writeFileSync(tmpFile, JSON.stringify(notebook));

  const result = extractCodeCells(tmpFile);
  fs.unlinkSync(tmpFile);

  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0], 'x = 1');
  assert.strictEqual(result[1], 'y = 2\nz = 3');
});

test('extractCodeCells returns empty array for notebook without cells', async () => {
  const { extractCodeCells } = await import('../utils/notebookParser.js');
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');
  const tmpDir = await os.tmpdir();
  const tmpFile = path.join(tmpDir, 'test_notebook2_' + Date.now() + '.ipynb');

  const notebook = {};
  fs.writeFileSync(tmpFile, JSON.stringify(notebook));

  const result = extractCodeCells(tmpFile);
  fs.unlinkSync(tmpFile);

  assert.deepStrictEqual(result, []);
});

test('extractCodeCells returns empty array for non-notebook JSON', async () => {
  const { extractCodeCells } = await import('../utils/notebookParser.js');
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');
  const tmpDir = await os.tmpdir();
  const tmpFile = path.join(tmpDir, 'test_notebook3_' + Date.now() + '.ipynb');

  fs.writeFileSync(tmpFile, JSON.stringify({ cells: 'not an array' }));

  const result = extractCodeCells(tmpFile);
  fs.unlinkSync(tmpFile);

  assert.deepStrictEqual(result, []);
});

test('extractCodeCells skips cells with empty source', async () => {
  const { extractCodeCells } = await import('../utils/notebookParser.js');
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');
  const tmpDir = await os.tmpdir();
  const tmpFile = path.join(tmpDir, 'test_notebook4_' + Date.now() + '.ipynb');

  const notebook = {
    cells: [
      { cell_type: 'code', source: '   \n  ' },
      { cell_type: 'code', source: 'valid = True' },
    ]
  };
  fs.writeFileSync(tmpFile, JSON.stringify(notebook));

  const result = extractCodeCells(tmpFile);
  fs.unlinkSync(tmpFile);

  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0], 'valid = True');
});
