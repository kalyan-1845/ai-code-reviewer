import test from 'node:test';
import assert from 'node:assert/strict';
import { stripMagicCommands } from '../utils/notebookParser.js';

test('notebookParser: stripMagicCommands strips indented magic commands and commands with trailing parameters', () => {
  const code = `
  %matplotlib inline
    %config InlineBackend.figure_format = 'retina'
  %%time
  print("hello")
  %%bash -x
  echo "test"
  `;
  const cleaned = stripMagicCommands(code);
  assert.equal(cleaned.includes('%matplotlib'), false);
  assert.equal(cleaned.includes('%config'), false);
  assert.equal(cleaned.includes('%%time'), false);
  assert.equal(cleaned.includes('%%bash'), false);
  assert.ok(cleaned.includes('print("hello")'));
  assert.ok(cleaned.includes('echo "test"'));
});
