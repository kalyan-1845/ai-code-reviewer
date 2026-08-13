import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidBranchName } from '../services/gitDeltaService.js';

test('isValidBranchName accepts valid branch names', () => {
  assert.equal(isValidBranchName('main'), true);
  assert.equal(isValidBranchName('feature/login_v2'), true);
  assert.equal(isValidBranchName('fix-123'), true);
});

test('isValidBranchName rejects invalid branch names and flag injections', () => {
  assert.equal(isValidBranchName(''), false);
  assert.equal(isValidBranchName(null), false);
  assert.equal(isValidBranchName(undefined), false);
  assert.equal(isValidBranchName('--output=/tmp/pwn'), false);
  assert.equal(isValidBranchName('-b'), false);
  assert.equal(isValidBranchName('feature/../etc'), false);
  assert.equal(isValidBranchName('main;whoami'), false);
});
