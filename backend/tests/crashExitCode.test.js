import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, '..');

function spawnNodeEval(script) {
  return spawn(
    process.execPath,
    ['--input-type=module', '-e', script],
    { cwd: backendDir, stdio: ['ignore', 'pipe', 'pipe'] }
  );
}

function waitForExit(child) {
  return new Promise((resolve) => {
    child.on('exit', (code, signal) => resolve({ code, signal }));
  });
}

const registerScript = `
  import { registerCrashHandlers } from './utils/crashHandlers.js';
  registerCrashHandlers((exitCode) => process.exit(exitCode));
`;

test('uncaughtException exits with a non-zero code', async () => {
  const child = spawnNodeEval(`${registerScript}
    throw new Error('intentional uncaught exception for exit-code test');
  `);
  const result = await waitForExit(child);
  assert.equal(result.signal, null, 'process must exit via code, not a signal');
  assert.notEqual(result.code, 0, 'crash exit code must be non-zero');
});

test('unhandledRejection exits with a non-zero code', async () => {
  const child = spawnNodeEval(`${registerScript}
    Promise.reject(new Error('intentional unhandled rejection for exit-code test'));
  `);
  const result = await waitForExit(child);
  assert.equal(result.signal, null, 'process must exit via code, not a signal');
  assert.notEqual(result.code, 0, 'crash exit code must be non-zero');
});

test('clean shutdown path exits with code 0', async () => {
  const child = spawnNodeEval(`${registerScript}
    process.exit(0);
  `);
  const result = await waitForExit(child);
  assert.equal(result.signal, null, 'process must exit via code, not a signal');
  assert.equal(result.code, 0, 'clean shutdown exit code must be zero');
});
