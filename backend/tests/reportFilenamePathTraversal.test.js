import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Unit tests for path traversal protection in report filename sanitization.
 * Verifies that malicious repository names cannot escape the attachment filename
 * and cause directory traversal or header injection attacks.
 *
 * Refs: Issue #783 — Code upload endpoint accepts arbitrary file paths via path traversal
 */

// Helper function that mirrors the sanitization logic in backend/index.js
function sanitizeFilename(repoName) {
  let str = String(repoName);
  try { str = decodeURIComponent(str); } catch { /* keep original */ }
  str = str.normalize('NFKC');
  str = str.replace(/\0/g, '');
  str = str.replace(/[/\\]+/g, '/').replace(/\.\.\/|\.\\/g, '');
  str = str.replace(/\.\.+/g, '_').replace(/(?:^|\/)[.]+(?=\/|$)/g, '_');
  str = str.replace(/[^\w.-]+/g, '_');
  return str;
}

test('sanitizeFilename: normal repository names pass through unchanged', () => {
  assert.equal(sanitizeFilename('my-repo'), 'my-repo');
  assert.equal(sanitizeFilename('my_repo'), 'my_repo');
  assert.equal(sanitizeFilename('my.repo'), 'my.repo');
  assert.equal(sanitizeFilename('myrepo123'), 'myrepo123');
});

test('sanitizeFilename: rejects directory traversal with ../ sequences', () => {
  const payload = '../../../etc/passwd';
  const sanitized = sanitizeFilename(payload);
  assert.ok(!sanitized.includes('..'), 'Sanitized output should not contain ..');
  assert.ok(!sanitized.includes('/'), 'Sanitized output should not contain /');
  assert.equal(sanitized, 'etc_passwd');
});

test('sanitizeFilename: rejects directory traversal with ..\\\ (Windows-style)', () => {
  const payload = '..\\..\\windows\\system32';
  const sanitized = sanitizeFilename(payload);
  assert.ok(!sanitized.includes('..'), 'Output should not contain ..');
  assert.ok(!sanitized.includes('\\'), 'Output should not contain \\');
  assert.ok(!sanitized.includes('/'), 'Output should not contain /');
});

test('sanitizeFilename: neutralizes null bytes and encoded variants', () => {
  // Null byte attempt
  const nullByte = 'report' + String.fromCharCode(0) + '.html';
  const sanitized1 = sanitizeFilename(nullByte);
  assert.ok(!sanitized1.includes(String.fromCharCode(0)), 'Should remove null bytes');

  // URL-encoded null byte %00
  const encoded = 'report%00.html';
  const sanitized2 = sanitizeFilename(encoded);
  assert.ok(!sanitized2.includes('%'), 'Should remove % characters');
});

test('sanitizeFilename: decodes URL-encoded path traversal sequences', () => {
  const payload = '%2e%2e%2f%2e%2e%2fetc%2fpasswd';
  const sanitized = sanitizeFilename(payload);
  assert.ok(!sanitized.includes('..'), 'Should not contain ..');
  assert.ok(!sanitized.includes('/'), 'Should not contain /');
  assert.ok(!sanitized.includes('%'), 'Should not contain % characters');
});

test('sanitizeFilename: neutralizes Unicode homoglyph path traversal', () => {
  // Unicode homoglyphs: \u2E2E (⸮) for ., \u2215 (∕) for /
  const payload = '\u2E2E\u2E2E\u2215\u2E2E\u2E2E\u2215etc\u2215passwd';
  const sanitized = sanitizeFilename(payload);
  assert.ok(!sanitized.includes('..'), 'Should not contain ..');
  assert.ok(!sanitized.includes('/'), 'Should not contain /');
});

test('sanitizeFilename: prevents header injection via carriage return and newline', () => {
  const crlfPayload = 'repo' + String.fromCharCode(13) + String.fromCharCode(10) + 'injected: true';
  const sanitized = sanitizeFilename(crlfPayload);
  assert.ok(
    !sanitized.includes(String.fromCharCode(13)) && !sanitized.includes(String.fromCharCode(10)),
    'Should remove CR/LF characters'
  );
});

test('sanitizeFilename: preserves legitimate hyphens and dots in filenames', () => {
  assert.equal(sanitizeFilename('my-awesome-repo'), 'my-awesome-repo');
  assert.equal(sanitizeFilename('version-1.2.3'), 'version-1.2.3');
  assert.equal(sanitizeFilename('repo_v2.0-final'), 'repo_v2.0-final');
});

test('sanitizeFilename: handles edge case of empty string', () => {
  const sanitized = sanitizeFilename('');
  assert.equal(sanitized, '');
});

test('sanitizeFilename: handles edge case of only special characters', () => {
  const sanitized = sanitizeFilename('!@#$%^&*()');
  assert.equal(sanitized, '_');
});

test('sanitizeFilename: handles unicode characters by replacing them with underscores', () => {
  const payload = 'repo_with_émoji_🚀_中文';
  const sanitized = sanitizeFilename(payload);
  // Latin letters and numbers should remain, unicode should be replaced
  assert.ok(sanitized.includes('repo'), 'Latin part should be preserved');
  assert.ok(!sanitized.includes('é'), 'Accented characters should be removed');
  assert.ok(!sanitized.includes('🚀'), 'Emoji should be removed');
  assert.ok(!sanitized.includes('中文'), 'Non-ASCII characters should be removed');
});

test('sanitizeFilename: Result when prefixed to a path results in an invalid/safe path', () => {
  // Simulate building a Content-Disposition filename
  const malicious = '../../../etc/passwd';
  const safeFilename = sanitizeFilename(malicious) + '_AUDIT_REPORT.html';

  // Verify the final filename is safe
  assert.ok(!safeFilename.includes('..'), 'Final filename should not allow traversal');
  assert.ok(!safeFilename.includes('/etc'), 'Final filename should not expose system paths');
  assert.equal(safeFilename, 'etc_passwd_AUDIT_REPORT.html');
});

test('sanitizeFilename: concatenated filenames in Content-Disposition headers are safe', () => {
  const scenarios = [
    { input: 'repo', expected: 'repo_AUDIT_REPORT.html' },
    { input: '../admin', expected: 'admin_AUDIT_REPORT.html' },
    { input: 'my-repo.old', expected: 'my-repo.old_AUDIT_REPORT.html' },
  ];

  scenarios.forEach(({ input, expected }) => {
    const filename = sanitizeFilename(input) + '_AUDIT_REPORT.html';
    assert.equal(filename, expected, `Input "${input}" should produce safe filename`);
  });
});
