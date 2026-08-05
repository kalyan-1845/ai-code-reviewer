import test from 'node:test';
import assert from 'node:assert/strict';
import { applySeverityConfig, categorizeFinding, DEFAULT_CONFIG } from '../utils/severityConfig.js';

test('applySeverityConfig maps security findings to error severity', () => {
  const findings = [
    { rule_id: 'security-no-creds', message: 'hardcoded AWS key', severity: 'warning' },
  ];
  const result = applySeverityConfig(findings, {
    severity: { security: 'error', performance: 'warning', style: 'info' },
    suppress: [],
  });
  assert.equal(result[0].severity, 'error');
  assert.equal(result[0].category, 'security');
});

test('applySeverityConfig maps performance findings to warning severity', () => {
  const findings = [
    { rule_id: 'perf-n-plus-one', message: 'N+1 query detected', severity: 'info' },
  ];
  const result = applySeverityConfig(findings, {
    severity: { security: 'error', performance: 'warning', style: 'info' },
    suppress: [],
  });
  assert.equal(result[0].severity, 'warning');
  assert.equal(result[0].category, 'performance');
});

test('applySeverityConfig suppresses findings by rule_id', () => {
  const findings = [
    { rule_id: 'suppress-me', message: 'something' },
    { rule_id: 'keep-me', message: 'something else' },
  ];
  const result = applySeverityConfig(findings, {
    severity: { security: 'error', performance: 'warning', style: 'info' },
    suppress: ['suppress-me'],
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].rule_id, 'keep-me');
});

test('applySeverityConfig preserves findings without a matching suppress rule', () => {
  const findings = [
    { rule_id: 'unknown-rule', message: 'some message' },
  ];
  const result = applySeverityConfig(findings, {
    severity: { security: 'error', performance: 'warning', style: 'info' },
    suppress: [],
  });
  assert.equal(result.length, 1);
});

test('applySeverityConfig handles findings with rule instead of rule_id', () => {
  const findings = [
    { rule: 'security-bug', message: 'SQL injection' },
  ];
  const result = applySeverityConfig(findings, {
    severity: { security: 'error', performance: 'warning', style: 'info' },
    suppress: [],
  });
  assert.equal(result[0].severity, 'error');
  assert.equal(result[0].category, 'security');
});

test('applySeverityConfig returns empty array for empty findings', () => {
  const result = applySeverityConfig([], {
    severity: { security: 'error', performance: 'warning', style: 'info' },
    suppress: [],
  });
  assert.deepEqual(result, []);
});

test('applySeverityConfig uses DEFAULT_CONFIG severity when no config provided', () => {
  const findings = [
    { rule_id: 'security-test', message: 'injection vulnerability' },
  ];
  const result = applySeverityConfig(findings, { suppress: [] });
  assert.equal(result[0].severity, 'error');
  assert.equal(result[0].category, 'security');
});

test('applySeverityConfig categorizes style findings as info', () => {
  const findings = [
    { rule_id: 'style-missing-comma', message: 'missing trailing comma' },
  ];
  const result = applySeverityConfig(findings, {
    severity: { security: 'error', performance: 'warning', style: 'info' },
    suppress: [],
  });
  assert.equal(result[0].severity, 'info');
  assert.equal(result[0].category, 'style');
});

test('applySeverityConfig categorizes uncategorized findings as other', () => {
  const findings = [
    { rule_id: 'random-rule', message: 'just a regular comment' },
  ];
  const result = applySeverityConfig(findings, {
    severity: { security: 'error', performance: 'warning', style: 'info' },
    suppress: [],
  });
  assert.equal(result[0].category, 'other');
});

test('applySeverityConfig preserves original finding fields', () => {
  const findings = [
    { rule_id: 'sec-1', message: 'vuln', severity: 'error', file: 'a.js', line: 10 },
  ];
  const result = applySeverityConfig(findings, {
    severity: { security: 'error', performance: 'warning', style: 'info' },
    suppress: [],
  });
  assert.equal(result[0].file, 'a.js');
  assert.equal(result[0].line, 10);
});
