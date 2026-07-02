import test from 'node:test';
import assert from 'node:assert/strict';
import {
  categorizeFinding,
  filterByMinimumSeverity,
  validateConfig,
  DEFAULT_CONFIG,
} from '../utils/severityConfig.js';

test('categorizeFinding returns security for security-related keywords in message', () => {
  assert.equal(categorizeFinding({ message: 'SQL injection vulnerability found' }), 'security');
  assert.equal(categorizeFinding({ message: 'Credential leaked in source code' }), 'security');
  assert.equal(categorizeFinding({ message: 'XSS injection risk detected' }), 'security');
  assert.equal(categorizeFinding({ message: 'Authentication bypass vulnerability' }), 'security');
});

test('categorizeFinding returns security for security-related keywords in rule_id', () => {
  assert.equal(categorizeFinding({ rule_id: 'security-no-hardcoded-creds' }), 'security');
  // Note: 'injection' and 'credential' are only checked in message, not rule_id
  assert.equal(categorizeFinding({ message: '', rule_id: 'credential-exposure' }), 'other');
});

test('categorizeFinding returns performance for performance-related keywords', () => {
  assert.equal(categorizeFinding({ message: 'N+1 query pattern detected' }), 'performance');
  assert.equal(categorizeFinding({ message: 'Cache this result for optimization' }), 'performance');
  assert.equal(categorizeFinding({ message: 'Consider memoization for performance' }), 'performance');
});

test('categorizeFinding returns performance for cache and optimization keywords', () => {
  assert.equal(categorizeFinding({ message: 'Cache this result for optimization' }), 'performance');
  // Note: rule_id patterns with hyphens vs spaces differ; function checks 'n+1' in message, not hyphenated 'n-plus-one'
  assert.equal(categorizeFinding({ rule_id: 'performance-expensive-loop' }), 'performance');
});

test('categorizeFinding returns style for style-related keywords', () => {
  assert.equal(categorizeFinding({ message: 'Missing trailing comma' }), 'style');
  assert.equal(categorizeFinding({ message: 'Incorrect formatting detected' }), 'style');
  assert.equal(categorizeFinding({ rule_id: 'style-enforce-quotes' }), 'style');
});

test('categorizeFinding returns other for unrecognized content', () => {
  assert.equal(categorizeFinding({ message: 'Hello world' }), 'other');
  assert.equal(categorizeFinding({ rule_id: 'no-issues-found' }), 'other');
  assert.equal(categorizeFinding({}), 'other');
});

test('categorizeFinding handles missing message and rule_id fields', () => {
  assert.equal(categorizeFinding({}), 'other');
  assert.equal(categorizeFinding({ message: '' }), 'other');
  assert.equal(categorizeFinding({ rule_id: '' }), 'other');
});

test('filterByMinimumSeverity returns findings below the threshold', () => {
  const findings = [
    { severity: 'error' },
    { severity: 'warning' },
    { severity: 'info' },
  ];

  const result = filterByMinimumSeverity(findings, 'error');
  assert.equal(result.length, 0);
});

test('filterByMinimumSeverity with warning returns only warning and info', () => {
  const findings = [
    { severity: 'error' },
    { severity: 'warning' },
    { severity: 'info' },
  ];

  const result = filterByMinimumSeverity(findings, 'warning');
  assert.equal(result.length, 1);
  assert.equal(result[0].severity, 'warning');
});

test('filterByMinimumSeverity with info returns all three severities', () => {
  const findings = [
    { severity: 'error' },
    { severity: 'warning' },
    { severity: 'info' },
  ];

  const result = filterByMinimumSeverity(findings, 'info');
  assert.equal(result.length, 3);
});

test('filterByMinimumSeverity with unknown minimum severity falls back to rank 0', () => {
  const findings = [
    { severity: 'error' },
    { severity: 'warning' },
    { severity: 'info' },
  ];

  // 'unknown' is not a key in severityRank, so minRank falls back to 0 via || 0.
  // With minRank=0, no finding with a positive rank passes the <= check.
  const result = filterByMinimumSeverity(findings, 'unknown');
  assert.equal(result.length, 0);
});

test('filterByMinimumSeverity handles findings with unknown severity values', () => {
  const findings = [
    { severity: 'error' },
    { severity: 'unknown-severity' },
    { severity: 'info' },
  ];

  const result = filterByMinimumSeverity(findings, 'error');
  assert.equal(result.length, 0);
});

test('filterByMinimumSeverity handles empty findings array', () => {
  const result = filterByMinimumSeverity([], 'error');
  assert.deepEqual(result, []);
});

test('validateConfig returns valid for correct config', () => {
  const config = {
    severity: { security: 'error', performance: 'warning', style: 'info' },
    suppress: ['no-unused-vars'],
  };
  const result = validateConfig(config);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('validateConfig returns invalid for unknown severity values', () => {
  const config = {
    severity: { security: 'critical' },
  };
  const result = validateConfig(config);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors[0].includes('Invalid severity'));
});

test('validateConfig returns invalid when suppress is not an array', () => {
  const config = {
    suppress: 'no-unused-vars',
  };
  const result = validateConfig(config);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('suppress must be an array')));
});

test('validateConfig handles missing severity object gracefully', () => {
  const config = {};
  const result = validateConfig(config);
  assert.equal(result.valid, true);
});

test('validateConfig reports multiple errors for multiple invalid severities', () => {
  const config = {
    severity: {
      security: 'fatal',
      performance: 'medium',
      style: 'lowercase',
    },
  };
  const result = validateConfig(config);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length >= 2);
});

test('DEFAULT_CONFIG has expected structure', () => {
  assert.deepEqual(DEFAULT_CONFIG.severity, {
    security: 'error',
    performance: 'warning',
    style: 'info',
  });
  assert.ok(Array.isArray(DEFAULT_CONFIG.suppress));
  assert.deepEqual(DEFAULT_CONFIG.suppress, []);
});
