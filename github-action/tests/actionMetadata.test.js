import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('action metadata declares max-review-files input used by runtime', () => {
  const actionYml = fs.readFileSync(path.join(__dirname, '..', 'action.yml'), 'utf8');
  const runtime = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');

  assert.match(runtime, /getInput\(['"]max-review-files['"]\)/);
  assert.match(actionYml, /^\s{2}max-review-files:/m);
  assert.match(actionYml, /default:\s*['"]50['"]/);
});
