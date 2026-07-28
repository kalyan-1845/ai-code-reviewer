import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidRepoUrl, parseRepoUrl, isSafeUrl } from '../utils/urlValidator.js';


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

test('isSafeUrl validates basic URL safety', async () => {
  const localResult = await isSafeUrl('https://127.0.0.1/');
  assert.equal(localResult.valid, false);
  assert.ok(localResult.reason.includes('private or restricted IP'));

  const publicResult = await isSafeUrl('https://github.com/');
  assert.equal(publicResult.valid, true);
});

test('isSafeUrl rejects domains resolving to at least one private IP (DNS round-robin / multi-IP)', async (t) => {
  const dns = await import('node:dns');
  
  t.mock.method(dns.default, 'lookup', (hostname, options, callback) => {
    const cb = typeof options === 'function' ? options : callback;
    const opts = typeof options === 'object' ? options : {};
    if (opts.all) {
      cb(null, [
        { address: '8.8.8.8', family: 4 },
        { address: '127.0.0.1', family: 4 }
      ]);
    } else {
      cb(null, '8.8.8.8', 4);
    }
  });

  const { isSafeUrl: freshIsSafeUrl } = await import(`../utils/urlValidator.js?test-mock=${Date.now()}`);
  const result = await freshIsSafeUrl('https://mixed-ip-domain.com');

  assert.equal(result.valid, false);
  assert.ok(result.reason.includes('private or restricted IP'));
});
