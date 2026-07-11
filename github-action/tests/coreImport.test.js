import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('action entrypoint imports @actions/core exactly once', () => {
  const entrypoint = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  const matches = entrypoint.match(/from ['"]@actions\/core['"]/g) || [];

  assert.equal(matches.length, 1);
});
