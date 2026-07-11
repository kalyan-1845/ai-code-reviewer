import test from 'node:test';
import assert from 'node:assert/strict';

test('repoReader module imports successfully with filesystem dependencies available', async () => {
  const module = await import('../utils/repoReader.js');

  assert.equal(typeof module.readCodeFilesFromLocalDir, 'function');
  assert.equal(typeof module.readCodeFilesFromRepo, 'function');
});
