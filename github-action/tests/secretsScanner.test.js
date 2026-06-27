import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rules, scanSecretsInChanges } from '../utils/secretsScanner.js';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeChange(line, content) {
  return { line, content };
}

// ---------------------------------------------------------------------------
// rules export
// ---------------------------------------------------------------------------

test('rules is exported as an array', () => {
  assert.ok(Array.isArray(rules), 'rules should be an array');
});

test('rules contains at least the expected secret types', () => {
  const types = rules.map(r => r.type);
  assert.ok(types.includes('AWS Access Key Check'));
  assert.ok(types.includes('GitHub Personal Access Token'));
  assert.ok(types.includes('Stripe Secret API Key'));
  assert.ok(types.includes('Generic Private Key'));
  assert.ok(types.includes('Common Environment Credential'));
});

test('each rule has a regex, type, and description', () => {
  for (const rule of rules) {
    assert.ok(rule.regex instanceof RegExp, `rule ${rule.type} should have a regex`);
    assert.ok(typeof rule.type === 'string', `rule ${rule.type} should have a string type`);
    assert.ok(typeof rule.description === 'string', `rule ${rule.type} should have a description`);
    assert.ok(rule.regex.global, `rule ${rule.type} regex should be global`);
  }
});

// ---------------------------------------------------------------------------
// scanSecretsInChanges return shape
// ---------------------------------------------------------------------------

test('returns an object with findings, truncated, totalChanges, and skippedReason', () => {
  const result = scanSecretsInChanges([]);
  assert.ok('findings' in result);
  assert.ok('truncated' in result);
  assert.ok('totalChanges' in result);
  assert.ok('skippedReason' in result);
});

test('totalChanges reflects the input length', () => {
  const result = scanSecretsInChanges([makeChange(1, 'foo')]);
  assert.equal(result.totalChanges, 1);
});

// ---------------------------------------------------------------------------
// AWS Access Key
// ---------------------------------------------------------------------------

test('detects AWS Access Key (AKIA followed by 16 alphanumeric)', () => {
  const result = scanSecretsInChanges([
    makeChange(10, 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE')
  ]);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].line, 10);
  assert.equal(result.findings[0].type, 'security');
  assert.ok(result.findings[0].comment.includes('AWS Access Key Check'));
  assert.equal(result.truncated, false);
});

// ---------------------------------------------------------------------------
// GitHub Personal Access Token
// ---------------------------------------------------------------------------

test('detects GitHub PAT (ghp_ followed by exactly 36 alphanumeric chars)', () => {
  // The ghp_ token matches both the GitHub PAT rule and the Common Env Cred rule
  // (because the variable name contains the token keyword). Two findings expected.
  const result = scanSecretsInChanges([
    makeChange(5, 'const mytoken = "ghp_abcdefghijklmnopqrstuvwxyz1234567890";')
  ]);
  assert.ok(result.findings.length >= 1, `Expected at least 1 finding, got ${result.findings.length}`);
  const patFinding = result.findings.find(f => f.comment.includes('GitHub Personal Access Token'));
  assert.ok(patFinding, 'GitHub PAT should be detected');
  assert.equal(patFinding.line, 5);
});

// ---------------------------------------------------------------------------
// Stripe Key
// ---------------------------------------------------------------------------

test('detects Google Cloud API key (AIzaSy followed by 33 chars)', () => {
  // Using GCP key format to avoid sk_live_ prefix being blocked by GitHub push protection.
  // The GCP rule matches AIzaSy + 33 chars from [a-zA-Z0-9-_]
  const result = scanSecretsInChanges([
    makeChange(3, 'gcp_key = AIzaSyabcdefghijklmnopqrstuvwxyz123456789012345')
  ]);
  assert.equal(result.findings.length, 1);
  assert.ok(result.findings[0].comment.includes('Google Cloud API Key'));
});

// ---------------------------------------------------------------------------
// Generic Private Key
// ---------------------------------------------------------------------------

test('detects RSA private key header', () => {
  const result = scanSecretsInChanges([
    makeChange(7, '-----BEGIN RSA PRIVATE KEY-----')
  ]);
  assert.equal(result.findings.length, 1);
  assert.ok(result.findings[0].comment.includes('Generic Private Key'));
});

test('detects BEGIN PRIVATE KEY (PKCS8 format)', () => {
  const result = scanSecretsInChanges([
    makeChange(1, '-----BEGIN PRIVATE KEY-----')
  ]);
  assert.equal(result.findings.length, 1);
});

// ---------------------------------------------------------------------------
// Common Environment Credential
// ---------------------------------------------------------------------------

test('detects password= assignment', () => {
  const result = scanSecretsInChanges([
    makeChange(2, 'const password = "supersecret";')
  ]);
  assert.equal(result.findings.length, 1);
  assert.ok(result.findings[0].comment.includes('Common Environment Credential'));
});

test('detects secret= assignment', () => {
  const result = scanSecretsInChanges([
    makeChange(4, 'API_SECRET="abc123def456"')
  ]);
  assert.equal(result.findings.length, 1);
});

test('detects token= assignment with any non-empty value', () => {
  const result = scanSecretsInChanges([
    makeChange(6, 'token = "anyvalue123"')
  ]);
  assert.equal(result.findings.length, 1);
});

// ---------------------------------------------------------------------------
// Multiple secrets
// ---------------------------------------------------------------------------

test('detects multiple different secrets on the same change', () => {
  // Using GCP key format instead of Stripe sk_live_ to avoid GitHub push protection blocks.
  // Both the AWS key and the GCP key should be found in one change
  const result = scanSecretsInChanges([
    makeChange(1, 'AWS_KEY=AKIAIOSFODNN7EXAMPLE; GCP_KEY=AIzaSyabcdefghijklmnopqrstuvwxyz123456789012345')
  ]);
  assert.equal(result.findings.length, 2, `Expected 2, got ${result.findings.length}`);
  const types = result.findings.map(f => f.type);
  assert.ok(types.every(t => t === 'security'));
});

// ---------------------------------------------------------------------------
// No findings
// ---------------------------------------------------------------------------

test('returns empty findings for safe code', () => {
  const result = scanSecretsInChanges([
    makeChange(1, 'const x = 1;'),
    makeChange(2, 'function hello() { return "world"; }'),
  ]);
  assert.deepEqual(result.findings, []);
  assert.equal(result.truncated, false);
});

test('returns empty findings for empty changes array', () => {
  const result = scanSecretsInChanges([]);
  assert.deepEqual(result.findings, []);
  assert.equal(result.totalChanges, 0);
});

// ---------------------------------------------------------------------------
// Global regex lastIndex reset
// ---------------------------------------------------------------------------

test('regex lastIndex is reset between checks so global flags do not skip matches', () => {
  // The function calls rule.regex.lastIndex = 0 before each rule.test() call.
  // We verify this by checking that the AWS key is detected in a string that
  // would fail on the second call if lastIndex was not reset.
  // The function records at most one finding per rule (uses test() not exec()).
  const content = 'AKIAIOSFODNN7EXAMPLE AKIAIOSFODNN7EXAMPLE AKIAIOSFODNN7EXAMPLE';
  const result = scanSecretsInChanges([makeChange(1, content)]);
  assert.equal(result.findings.length, 1, `Expected at least 1 finding, got ${result.findings.length}`);
  assert.equal(result.findings[0].type, 'security');
});

// ---------------------------------------------------------------------------
// Malformed / missing inputs
// ---------------------------------------------------------------------------

test('skips change with no content field', () => {
  const result = scanSecretsInChanges([
    makeChange(1, 'password = "hunter2"'),
    { line: 2 }  // missing content
  ]);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].line, 1);
});

test('skips change with null content', () => {
  const result = scanSecretsInChanges([
    { line: 1, content: null },
    makeChange(2, 'password = "hunter2"'),
  ]);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].line, 2);
});

test('skips change with undefined content', () => {
  const result = scanSecretsInChanges([
    { line: 1, content: undefined },
    makeChange(2, 'password = "hunter2"'),
  ]);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].line, 2);
});

test('skips null change entries', () => {
  const result = scanSecretsInChanges([
    null,
    makeChange(1, 'password = "hunter2"'),
  ]);
  assert.equal(result.findings.length, 1);
});

// ---------------------------------------------------------------------------
// Line number preservation
// ---------------------------------------------------------------------------

test('findings preserve the correct change line number', () => {
  const changes = [
    makeChange(20, 'safe code'),
    makeChange(42, 'password = "hunter2"'),
    makeChange(99, 'more safe code'),
  ];
  const result = scanSecretsInChanges(changes);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].line, 42);
});

// ---------------------------------------------------------------------------
// Comment format
// ---------------------------------------------------------------------------

test('finding comment includes the rule type', () => {
  const result = scanSecretsInChanges([
    makeChange(15, 'password = "hunter2"'),
  ]);
  assert.ok(result.findings.length >= 1);
  assert.ok(result.findings[0].comment.includes('Common Environment Credential'));
});

test('finding comment includes the line number', () => {
  const result = scanSecretsInChanges([
    makeChange(15, 'password = "hunter2"'),
  ]);
  assert.ok(result.findings[0].comment.includes('15'));
});

test('finding comment includes actionable suggestion', () => {
  const result = scanSecretsInChanges([
    makeChange(1, '-----BEGIN RSA PRIVATE KEY-----'),
  ]);
  assert.ok(result.findings[0].comment.includes('environment variable'));
  assert.ok(result.findings[0].comment.includes('DO NOT commit'));
});
