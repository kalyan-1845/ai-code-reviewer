import { createRequire } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import { load as yamlLoad } from 'js-yaml';

const require = createRequire(import.meta.url);
const installedYamlPkg = require('js-yaml/package.json');

// GHSA-pm4m-ph32-ghv5: js-yaml < 5.2.2 takes O(2^n) time parsing nested flow
// sequence pairs. A sub-200-byte payload with ~30 nesting levels hangs a
// single-threaded Node process for minutes. The regression here feeds exactly
// that payload and asserts parsing completes in bounded time.

const MIN_PATCHED_VERSION = [5, 2, 2];
const MAX_PARSE_TIME_MS = 5000;

function versionGte(actual, expected) {
  const parts = actual.split('.').map(Number);
  for (let i = 0; i < expected.length; i++) {
    const a = parts[i] ?? 0;
    const b = expected[i];
    if (a > b) return true;
    if (a < b) return false;
  }
  return true;
}

test('installed js-yaml is patched for GHSA-pm4m-ph32-ghv5 (>= 5.2.2)', () => {
  const installed = installedYamlPkg.version;
  assert.ok(
    typeof installed === 'string' && versionGte(installed, MIN_PATCHED_VERSION),
    `expected js-yaml >= ${MIN_PATCHED_VERSION.join('.')}, got ${installed}`
  );
});

test('deeply-nested flow-collection payload parses in bounded time (regression for GHSA-pm4m-ph32-ghv5)', () => {
  const nesting = 30;
  const payload = `${'[ '.repeat(nesting)}1${' ]: 0'.repeat(nesting)}`;

  const started = Date.now();
  let outcome = 'ok';
  try {
    yamlLoad(payload);
  } catch (err) {
    // A well-formed document is parsed; a semantically-invalid one throws.
    // Either way the parser must finish quickly and must never hang.
    outcome = 'threw';
  }
  const elapsed = Date.now() - started;

  assert.ok(outcome === 'ok' || outcome === 'threw', 'parser must complete');
  assert.ok(
    elapsed < MAX_PARSE_TIME_MS,
    `nested flow-collection parse took ${elapsed}ms (expected < ${MAX_PARSE_TIME_MS}ms); ` +
      'this indicates the exponential-time js-yaml DoS is back'
  );
});
