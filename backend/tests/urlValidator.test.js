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

test('urlValidator: isValidRepoUrl rejects URLs with username, password, search, hash, or invalid path', () => {
  // Rejects URLs with username
  assert.equal(isValidRepoUrl('https://user@github.com/owner/repo'), false);
  // Rejects URLs with password
  assert.equal(isValidRepoUrl('https://github.com/owner/repo?token=abc'), false);
  // Rejects URLs with query string
  assert.equal(isValidRepoUrl('https://github.com/owner/repo?q=1'), false);
  // Rejects URLs with hash fragment
  assert.equal(isValidRepoUrl('https://github.com/owner/repo#readme'), false);
  // Rejects URLs with double slash in path
  assert.equal(isValidRepoUrl('https://github.com/owner//repo'), false);
  // Rejects URLs with leading hyphen in segment
  assert.equal(isValidRepoUrl('https://github.com/-owner/repo'), false);
  assert.equal(isValidRepoUrl('https://github.com/owner/-repo'), false);
  // Rejects URLs with double-hyphen in segment
  assert.equal(isValidRepoUrl('https://github.com/owner--repo/repo'), false);
  // Rejects URLs with invalid characters in segment
  assert.equal(isValidRepoUrl('https://github.com/own er/repo'), false);
  assert.equal(isValidRepoUrl('https://github.com/owner/repo!'), false);
  // Rejects URLs with whitespace
  assert.equal(isValidRepoUrl('https://github.com/owner/repo\n'), false);
  // Rejects URLs with control characters
  assert.equal(isValidRepoUrl('https://github.com/owner\x00/repo'), false);
  // Rejects null/undefined/empty
  assert.equal(isValidRepoUrl(null), false);
  assert.equal(isValidRepoUrl(undefined), false);
  assert.equal(isValidRepoUrl(''), false);
  assert.equal(isValidRepoUrl(123), false);
});

test('urlValidator: parseRepoUrl extracts owner and repo from valid URLs', () => {
  const result1 = parseRepoUrl('https://github.com/owner/repo');
  assert.equal(result1.owner, 'owner');
  assert.equal(result1.repo, 'repo');

  const result2 = parseRepoUrl('https://github.com/owner/repo.git');
  assert.equal(result2.owner, 'owner');
  assert.equal(result2.repo, 'repo');

  const result3 = parseRepoUrl('https://github.com/org-name/repo_name');
  assert.equal(result3.owner, 'org-name');
  assert.equal(result3.repo, 'repo_name');

  // Invalid URLs return null
  assert.equal(parseRepoUrl('https://gitlab.com/owner/repo'), null);
  assert.equal(parseRepoUrl('https://github.com/owner'), null);
  assert.equal(parseRepoUrl(null), null);
  assert.equal(parseRepoUrl(''), null);
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
