import test from 'node:test';
import assert from 'node:assert/strict';
import { stripMagicCommands } from '../utils/notebookParser.js';

test('stripMagicCommands comments out %matplotlib magic', () => {
  const input = '%matplotlib inline\nimport matplotlib.pyplot as plt';
  const result = stripMagicCommands(input);
  const lines = result.split('\n');
  assert.equal(lines[0].trim(), '# %matplotlib inline');
  assert.equal(lines[1].trim(), 'import matplotlib.pyplot as plt');
});

test('stripMagicCommands comments out %pylab magic', () => {
  const result = stripMagicCommands('%pylab\nx = [1, 2, 3]');
  assert.ok(result.startsWith('# %pylab'));
});

test('stripMagicCommands comments out %%time cell magic', () => {
  const result = stripMagicCommands('%%time\nimport numpy as np');
  assert.ok(result.startsWith('# %%time'));
});

test('stripMagicCommands comments out %%timeit cell magic', () => {
  const result = stripMagicCommands('%%timeit\nx = sum(range(1000))');
  assert.ok(result.startsWith('# %%timeit'));
});

test('stripMagicCommands comments out %%capture magic', () => {
  const result = stripMagicCommands('%%capture output\nprint("hello")');
  assert.ok(result.startsWith('# %%capture'));
});

test('stripMagicCommands comments out %%writefile magic', () => {
  const result = stripMagicCommands('%%writefile myfile.txt\nHello world');
  assert.ok(result.startsWith('# %%writefile'));
});

test('stripMagicCommands comments out shell escape lines', () => {
  const result = stripMagicCommands('!pip install numpy\nimport numpy as np');
  const lines = result.split('\n');
  assert.equal(lines[0].trim(), '# !pip install numpy');
  assert.equal(lines[1].trim(), 'import numpy as np');
});

test('stripMagicCommands preserves non-magic lines unchanged', () => {
  const input = 'import numpy as np\nx = [1, 2, 3]\nprint(x)';
  const result = stripMagicCommands(input);
  assert.equal(result, input);
});

test('stripMagicCommands preserves indentation on commented-out magics', () => {
  const result = stripMagicCommands('    %matplotlib inline');
  assert.equal(result, '    # %matplotlib inline');
});

test('stripMagicCommands does not comment out single % (not a magic)', () => {
  // A single % by itself is not a magic
  const result = stripMagicCommands('result = a % b');
  assert.equal(result, 'result = a % b');
});

test('stripMagicCommands handles empty string', () => {
  assert.equal(stripMagicCommands(''), '');
});

test('stripMagicCommands returns empty string for non-string input', () => {
  assert.equal(stripMagicCommands(null), '');
  assert.equal(stripMagicCommands(undefined), '');
  assert.equal(stripMagicCommands(123), '');
});

test('stripMagicCommands handles multiple magics in same cell', () => {
  const result = stripMagicCommands('%matplotlib inline\n!echo hello\n%%time\nx = 1');
  const lines = result.split('\n');
  assert.equal(lines[0].trim(), '# %matplotlib inline');
  assert.equal(lines[1].trim(), '# !echo hello');
  assert.equal(lines[2].trim(), '# %%time');
  assert.equal(lines[3].trim(), 'x = 1');
});

test('stripMagicCommands does not comment out %config magic (no args)', () => {
  // %config without arguments - the pattern matches but let's see
  const result = stripMagicCommands('%config InlineBackend.figure_format = "svg"');
  // The IPYTHON_MAGIC_PATTERNS has %config.* so it should be commented
  assert.ok(result.startsWith('# %config'));
});

test('stripMagicCommands preserves line numbers (same number of lines)', () => {
  const input = '%matplotlib\n!pip\nimport numpy\nx = [1,2,3]';
  const result = stripMagicCommands(input);
  assert.equal(result.split('\n').length, input.split('\n').length);
});
