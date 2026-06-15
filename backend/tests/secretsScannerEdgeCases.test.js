import test from 'node:test';
import assert from 'node:assert/strict';
import { scanSecrets, scanSecretsInChanges } from '../utils/secretsScanner.js';

test('scanSecrets returns empty array for invalid inputs', () => {
  assert.deepEqual(scanSecrets(null), []);
  assert.deepEqual(scanSecrets(undefined), []);
  assert.deepEqual(scanSecrets(12345), []);
  assert.deepEqual(scanSecrets({}), []);
});

test('scanSecretsInChanges returns empty array for invalid inputs', () => {
  assert.deepEqual(scanSecretsInChanges(null), []);
  assert.deepEqual(scanSecretsInChanges(undefined), []);
  assert.deepEqual(scanSecretsInChanges("invalid_string"), []);
  assert.deepEqual(scanSecretsInChanges({}), []);
});

test('scanSecretsInChanges handles invalid change objects gracefully', () => {
  const changes = [
    null,
    { line: 5 },
    { line: 10, content: null },
    { line: 12, content: 'clean content' }
  ];
  const results = scanSecretsInChanges(changes);
  assert.deepEqual(results, []);
});
