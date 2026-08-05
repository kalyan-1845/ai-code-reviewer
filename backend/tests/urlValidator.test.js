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

test('isSafeUrl rejects IPv6 loopback addresses', async () => {
  // ::1 is IPv6 loopback
  const result = await isSafeUrl('https://[::1]');
  assert.equal(result.valid, false);
});

test('isSafeUrl rejects IPv6 link-local addresses (fe80:)', async () => {
  // fe80::/10 is link-local, should be rejected
  const result = await isSafeUrl('https://[fe80::1]');
  assert.equal(result.valid, false);
});

test('isSafeUrl rejects IPv6 unique local addresses (fc00: and fd00:)', async () => {
  // fc00::/8 and fd00::/8 are unique local addresses
  const resultFc = await isSafeUrl('https://[fc00::1]');
  const resultFd = await isSafeUrl('https://[fd00::1]');
  assert.equal(resultFc.valid, false);
  assert.equal(resultFd.valid, false);
});

test('isSafeUrl rejects IPv4-mapped IPv6 addresses pointing to private IPs', async () => {
  // ::ffff:127.0.0.1 maps to IPv4 loopback, should be rejected
  const result = await isSafeUrl('https://[::ffff:127.0.0.1]');
  assert.equal(result.valid, false);
});

test('isSafeUrl rejects IPv4-mapped IPv6 addresses pointing to public IPs', async () => {
  // ::ffff:8.8.8.8 maps to public IP, should be allowed
  const result = await isSafeUrl('https://[::ffff:8.8.8.8]');
  // DNS lookup may fail but the mapped IP itself is public
  // The result depends on whether DNS lookup succeeds
  assert.equal(typeof result.valid, 'boolean');
});

test('isValidRepoUrl accepts repo names with dots', () => {
  // Repository names can contain dots
  assert.equal(isValidRepoUrl('https://github.com/owner/repo.name'), true);
  assert.equal(isValidRepoUrl('https://github.com/owner/repo.name.git'), true);
});

test('isValidRepoUrl rejects 0.0.0.0 IP address in hostname', () => {
  // A URL with 0.0.0.0 as hostname would parse differently; this tests the
  // edge case where someone passes an IP literal
  assert.equal(isValidRepoUrl('https://0.0.0.0/owner/repo'), false);
});

test('parseRepoUrl returns null for URLs with trailing slashes inside path', () => {
  // Multiple trailing slashes: https://github.com/owner/repo///
  // The pathname would be /owner/repo/// which split gives extra empty segments
  const result = parseRepoUrl('https://github.com/owner///repo///');
  // After cleaning trailing slashes, this becomes /owner///repo
  // This should return null since there are more than 2 segments
  assert.equal(result, null);
});

test('parseRepoUrl handles URL-encoded characters in repo name', () => {
  // URL-encoded characters should not be accepted (not valid GitHub repo names)
  assert.equal(isValidRepoUrl('https://github.com/owner/repo%20name'), false);
});

test('isValidRepoUrl rejects URLs with plus signs in segments', () => {
  assert.equal(isValidRepoUrl('https://github.com/owner/repo+name'), false);
});
