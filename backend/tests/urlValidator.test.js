import test from 'node:test';
import assert from 'node:assert/strict';
import { isSafeUrl, isValidRepoUrl, parseRepoUrl } from '../utils/urlValidator.js';

test('urlValidator: isSafeUrl rejects private and link-local IPv4 subnets', async () => {
  // Test loopback
  assert.equal((await isSafeUrl('https://127.0.0.1')).valid, false);
  
  // Test class A private
  assert.equal((await isSafeUrl('https://10.0.0.1')).valid, false);

  // Test class B private boundary values
  assert.equal((await isSafeUrl('https://172.16.0.1')).valid, false);
  assert.equal((await isSafeUrl('https://172.17.25.1')).valid, false, 'SSRF bypass range 172.17.x.x should be blocked');
  assert.equal((await isSafeUrl('https://172.31.255.254')).valid, false, 'SSRF bypass range 172.31.x.x should be blocked');
  assert.equal((await isSafeUrl('https://172.32.0.1')).valid, true, 'Public range 172.32.x.x should be allowed');

  // Test shared address space 100.64.0.0/10 boundary values
  assert.equal((await isSafeUrl('https://100.64.0.1')).valid, false);
  assert.equal((await isSafeUrl('https://100.100.0.1')).valid, false, 'Shared address space bypass should be blocked');
  assert.equal((await isSafeUrl('https://100.127.255.255')).valid, false);
  assert.equal((await isSafeUrl('https://100.128.0.1')).valid, true);

  // Test public address
  // We mock dns.lookup or rely on localhost being resolved as loopback, but we can just check isPrivateIP function directly if needed.
  // Since dnsLookup resolves localhost to 127.0.0.1, let's verify it rejects:
  assert.equal((await isSafeUrl('https://localhost')).valid, false);
});

test('urlValidator: isValidRepoUrl returns correct boolean', () => {
  assert.equal(isValidRepoUrl('https://github.com/owner/repo'), true);
  assert.equal(isValidRepoUrl('https://github.com/owner/repo.git'), true);
  assert.equal(isValidRepoUrl('https://github.com/owner/repo/'), true);
  assert.equal(isValidRepoUrl('http://github.com/owner/repo'), false);
  assert.equal(isValidRepoUrl('https://gitlab.com/owner/repo'), false);
  assert.equal(isValidRepoUrl('https://github.com/owner'), false);
});
