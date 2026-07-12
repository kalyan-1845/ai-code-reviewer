import test from 'node:test';
import assert from 'node:assert/strict';
import { applySeverityConfig, DEFAULT_CONFIG } from '../utils/severityConfig.js';

test('applySeverityConfig returns empty array when given empty findings array', () => {
  const result = applySeverityConfig([], {});
  assert.deepEqual(result, []);
});

test('applySeverityConfig maps security-category findings to error severity by default', () => {
  const findings = [
    { rule_id: 'sql-injection', message: 'SQL injection vulnerability found' },
  ];
  const result = applySeverityConfig(findings, {});
  assert.equal(result.length, 1);
  assert.equal(result[0].severity, 'error');
  assert.equal(result[0].category, 'security');
});

test('applySeverityConfig maps performance-category findings to warning severity by default', () => {
  const findings = [
    { rule_id: 'slow-query', message: 'N+1 query pattern detected' },
  ];
  const result = applySeverityConfig(findings, {});
  assert.equal(result.length, 1);
  assert.equal(result[0].severity, 'warning');
  assert.equal(result[0].category, 'performance');
});

test('applySeverityConfig maps style-category findings to info severity by default', () => {
  const findings = [
    { rule_id: 'missing-comma', message: 'Missing trailing comma' },
  ];
  const result = applySeverityConfig(findings, {});
  assert.equal(result.length, 1);
  assert.equal(result[0].severity, 'info');
  assert.equal(result[0].category, 'style');
});

test('applySeverityConfig respects custom severity mappings in config', () => {
  const findings = [
    { rule_id: 'sql-injection', message: 'SQL injection vulnerability found' },
  ];
  const config = {
    severity: { security: 'warning' },
    suppress: [],
  };
  const result = applySeverityConfig(findings, config);
  assert.equal(result[0].severity, 'warning');
  assert.equal(result[0].category, 'security');
});

test('applySeverityConfig filters out findings with rule_ids in the suppress array', () => {
  const findings = [
    { rule_id: 'no-unused-vars', message: 'unused variable' },
    { rule_id: 'semi', message: 'missing semicolon' },
  ];
  const config = {
    severity: DEFAULT_CONFIG.severity,
    suppress: ['no-unused-vars'],
  };
  const result = applySeverityConfig(findings, config);
  assert.equal(result.length, 1);
  assert.equal(result[0].rule_id, 'semi');
});

test('applySeverityConfig adds category field to each returned finding', () => {
  const findings = [
    { rule_id: 'sql-injection', message: 'SQL injection vulnerability found' },
    { rule_id: 'slow-query', message: 'N+1 query' },
  ];
  const result = applySeverityConfig(findings, {});
  assert.ok('category' in result[0]);
  assert.ok('category' in result[1]);
  assert.equal(result[0].category, 'security');
  assert.equal(result[1].category, 'performance');
});

test('applySeverityConfig preserves original finding fields', () => {
  const findings = [
    {
      rule_id: 'sql-injection',
      message: 'SQL injection',
      line: 42,
      file: 'src/db.js',
    },
  ];
  const result = applySeverityConfig(findings, {});
  assert.equal(result[0].line, 42);
  assert.equal(result[0].file, 'src/db.js');
  assert.equal(result[0].rule_id, 'sql-injection');
  assert.equal(result[0].message, 'SQL injection');
});

test('applySeverityConfig defaults findings with other category to original severity', () => {
  const findings = [
    { rule_id: 'custom-rule', message: 'something unspecified' },
  ];
  const result = applySeverityConfig(findings, {});
  assert.equal(result.length, 1);
  assert.equal(result[0].category, 'other');
});

test('applySeverityConfig handles findings with null rule_id', () => {
  const findings = [
    { message: 'SQL injection vulnerability' },
    { message: 'performance issue' },
  ];
  const result = applySeverityConfig(findings, {});
  assert.equal(result.length, 2);
  assert.equal(result[0].category, 'security');
  assert.equal(result[1].category, 'performance');
});

test('applySeverityConfig handles findings with undefined rule_id', () => {
  const findings = [
    { rule_id: undefined, message: 'style issue' },
  ];
  const result = applySeverityConfig(findings, {});
  assert.equal(result.length, 1);
  assert.equal(result[0].category, 'style');
});

test('applySeverityConfig handles findings with empty message', () => {
  const findings = [
    { rule_id: 'test-rule', message: '' },
  ];
  const result = applySeverityConfig(findings, {});
  assert.equal(result.length, 1);
  assert.equal(result[0].category, 'other');
});

test('applySeverityConfig handles empty suppress array', () => {
  const findings = [
    { rule_id: 'test-rule', message: 'security issue' },
  ];
  const config = {
    severity: DEFAULT_CONFIG.severity,
    suppress: [],
  };
  const result = applySeverityConfig(findings, config);
  assert.equal(result.length, 1);
});

test('applySeverityConfig uses DEFAULT_CONFIG when config is empty object', () => {
  const findings = [
    { rule_id: 'test-rule', message: 'security issue' },
  ];
  const result = applySeverityConfig(findings, {});
  assert.equal(result[0].severity, 'error');
  assert.equal(result[0].category, 'security');
});

test('applySeverityConfig suppresses findings using fallback rule field when rule_id is missing', () => {
  const findings = [
    { rule: 'suppressed-rule-name', message: 'style issue' },
    { rule: 'kept-rule-name', message: 'performance issue' },
  ];
  const config = {
    suppress: ['suppressed-rule-name'],
  };
  const result = applySeverityConfig(findings, config);
  assert.equal(result.length, 1);
  assert.equal(result[0].rule, 'kept-rule-name');
});
