import test from 'node:test';
import assert from 'node:assert/strict';

const originalWarn = console.warn;
const originalEnv = process.env.SECRETS_MAX_LINE_LENGTH;
console.warn = () => {};

test('scanSecrets returns empty array for null input', async () => {
  const { scanSecrets } = await import('../utils/secretsScanner.js');
  assert.deepStrictEqual(scanSecrets(null), []);
});

test('scanSecrets returns empty array for undefined input', async () => {
  const { scanSecrets } = await import('../utils/secretsScanner.js');
  assert.deepStrictEqual(scanSecrets(undefined), []);
});

test('scanSecrets returns empty array for number input', async () => {
  const { scanSecrets } = await import('../utils/secretsScanner.js');
  assert.deepStrictEqual(scanSecrets(12345), []);
});

test('scanSecrets returns empty array for object input', async () => {
  const { scanSecrets } = await import('../utils/secretsScanner.js');
  assert.deepStrictEqual(scanSecrets({ key: 'value' }), []);
});

test('scanSecrets returns empty array for empty string', async () => {
  const { scanSecrets } = await import('../utils/secretsScanner.js');
  assert.deepStrictEqual(scanSecrets(''), []);
});

test('scanSecrets returns empty array when no secrets are present', async () => {
  const { scanSecrets } = await import('../utils/secretsScanner.js');
  const code = 'def hello():\n    print("world")';
  assert.deepStrictEqual(scanSecrets(code), []);
});

test('scanSecrets detects AWS Access Key', async () => {
  const { scanSecrets } = await import('../utils/secretsScanner.js');
  const code = 'AWS_KEY = "AKIAIOSFODNN7EXAMPLE"';
  const findings = scanSecrets(code);
  assert.ok(findings.length > 0);
  assert.ok(findings.some(f => f.type === 'AWS Access Key Check'));
});

test('scanSecrets detects Google Cloud API key', async () => {
  const { scanSecrets } = await import('../utils/secretsScanner.js');
  const code = 'GCP_KEY = "AIzaSyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"';
  const findings = scanSecrets(code);
  assert.ok(findings.length > 0);
  assert.ok(findings.some(f => f.type === 'Google Cloud API Key'));
});

test('scanSecrets detects database connection string with credentials', async () => {
  const { scanSecrets } = await import('../utils/secretsScanner.js');
  const code = 'DB_URL = "postgresql://user:password123@localhost:5432/db"';
  const findings = scanSecrets(code);
  assert.ok(findings.length > 0);
  assert.ok(findings.some(f => f.type === 'Database Connection Credentials'));
});

test('scanSecrets detects generic private key', async () => {
  const { scanSecrets } = await import('../utils/secretsScanner.js');
  const code = '-----BEGIN RSA PRIVATE KEY-----\nMIIBOQIBAAJBALRiMLAHudeSA2...\n-----END RSA PRIVATE KEY-----';
  const findings = scanSecrets(code);
  assert.ok(findings.length > 0);
  assert.ok(findings.some(f => f.type === 'Generic Private Key'));
});

test('scanSecrets detects hardcoded password assignment', async () => {
  const { scanSecrets } = await import('../utils/secretsScanner.js');
  const code = 'password = "supersecret123"';
  const findings = scanSecrets(code);
  assert.ok(findings.length > 0);
  assert.ok(findings.some(f => f.type === 'Common Environment Credential'));
});

test('scanSecrets detects hardcoded secret_key assignment', async () => {
  const { scanSecrets } = await import('../utils/secretsScanner.js');
  const code = 'secret_key = "sk_test_fakesecretfakevaluefake"';
  const findings = scanSecrets(code);
  assert.ok(findings.length > 0);
  assert.ok(findings.some(f => f.type === 'Common Environment Credential'));
});

test('scanSecrets detects JWT token', async () => {
  const { scanSecrets } = await import('../utils/secretsScanner.js');
  const code = 'token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.kiyOrthPqWEOOWKky_qUrsJNRF7gV1b0"';
  const findings = scanSecrets(code);
  assert.ok(findings.length > 0);
  assert.ok(findings.some(f => f.type === 'JWT Token Check'));
});

test('scanSecrets detects auth_token assignment', async () => {
  const { scanSecrets } = await import('../utils/secretsScanner.js');
  const code = 'auth_token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.fakefakefakefakefakefakefakefakefake"';
  const findings = scanSecrets(code);
  assert.ok(findings.length > 0);
  assert.ok(findings.some(f => f.type === 'Common Environment Credential'));
});

test('scanSecrets returns findings with expected shape', async () => {
  const { scanSecrets } = await import('../utils/secretsScanner.js');
  const code = 'AWS_KEY = "AKIAIOSFODNN7EXAMPLE"';
  const findings = scanSecrets(code);
  assert.ok(findings.length > 0);
  const f = findings[0];
  assert.ok('type' in f);
  assert.ok('line' in f);
  assert.ok('column' in f);
  assert.ok('description' in f);
  assert.ok('suggestion' in f);
});

test('scanSecrets skips lines longer than maxLineLength', async () => {
  process.env.SECRETS_MAX_LINE_LENGTH = '50';
  try {
    const { scanSecrets } = await import('../utils/secretsScanner.js');
    const longLine = 'A'.repeat(100) + '"AKIAIOSFODNN7EXAMPLE"';
    const findings = scanSecrets(longLine);
    assert.deepStrictEqual(findings, []);
  } finally {
    process.env.SECRETS_MAX_LINE_LENGTH = originalEnv || '';
  }
});

test('scanSecrets uses default maxLineLength of 2000', async () => {
  delete process.env.SECRETS_MAX_LINE_LENGTH;
  const { scanSecrets } = await import('../utils/secretsScanner.js');
  const line = 'A'.repeat(1000) + '"AKIAIOSFODNN7EXAMPLE"';
  const findings = scanSecrets(line);
  assert.ok(findings.length > 0, 'Should detect AWS key in line under 2000 chars');
});

test('scanSecrets returns findings at correct line numbers', async () => {
  const { scanSecrets } = await import('../utils/secretsScanner.js');
  const code = 'line one\naws_key = "AKIAIOSFODNN7EXAMPLE"\nline three';
  const findings = scanSecrets(code);
  assert.ok(findings.length > 0);
  assert.strictEqual(findings[0].line, 2);
});

test('scanSecrets finds multiple secrets on same line', async () => {
  const { scanSecrets } = await import('../utils/secretsScanner.js');
  const code = 'AWS="AKIAIOSFODNN7EXAMPLE" DB_URL="postgresql://user:pass@localhost/db"';
  const findings = scanSecrets(code);
  assert.ok(findings.length >= 2, 'Should find at least 2 secrets on the same line');
});

test('scanSecrets handles multiline content', async () => {
  const { scanSecrets } = await import('../utils/secretsScanner.js');
  const code = 'line1\nmypassword = "supersecret456"\nline3';
  const findings = scanSecrets(code);
  assert.ok(findings.length > 0);
  assert.strictEqual(findings[0].line, 2);
});

test('scanSecrets detects multiple credentials on different lines', async () => {
  const { scanSecrets } = await import('../utils/secretsScanner.js');
  const code = 'AWS_KEY = "AKIAIOSFODNN7EXAMPLE"\npassword = "supersecret123"\nDB_URL = "postgresql://user:pass@localhost/db"';
  const findings = scanSecrets(code);
  assert.ok(findings.length >= 3, 'Should find secrets on each line');
});

console.warn = originalWarn;
