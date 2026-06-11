import test from 'node:test';
import assert from 'node:assert/strict';
import { scanSecrets } from '../utils/secretsScanner.js';

test('scanSecrets detects standard JWT token format', () => {
  const content = 'const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";';
  const findings = scanSecrets(content);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].type, 'JWT Token Check');
});

test('scanSecrets detects generic api keys and tokens', () => {
  const content1 = 'api_key = "abcdef1234567890"';
  const content2 = 'auth_token: "mysecretstring123"';

  assert.ok(scanSecrets(content1).length >= 1);
  assert.ok(scanSecrets(content1).some(f => f.type === 'Generic API Key / Token'));

  assert.ok(scanSecrets(content2).length >= 1);
  assert.ok(scanSecrets(content2).some(f => f.type === 'Generic API Key / Token'));
});

test('scanSecrets does not flag standard normal strings', () => {
  const content = 'This is normal code text and comments without credentials.';
  const findings = scanSecrets(content);
  assert.equal(findings.length, 0);
});
