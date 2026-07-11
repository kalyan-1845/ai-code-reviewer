import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { getReportPath } from '../utils/reportGenerator.js';

test('getReportPath returns review-report.json with default arguments', () => {
  const result = getReportPath();
  assert.equal(result, path.join('.', 'review-report.json'));
});

test('getReportPath returns review-report.json when format is json', () => {
  const result = getReportPath('json');
  assert.equal(result, path.join('.', 'review-report.json'));
});

test('getReportPath returns review-report.html when format is html', () => {
  const result = getReportPath('html');
  assert.equal(result, path.join('.', 'review-report.html'));
});

test('getReportPath uses custom output directory', () => {
  const result = getReportPath('json', '/tmp/reports');
  assert.equal(result, path.join('/tmp/reports', 'review-report.json'));
});

test('getReportPath uses custom output directory with html format', () => {
  const result = getReportPath('html', '/var/log/ai-reviews');
  assert.equal(result, path.join('/var/log/ai-reviews', 'review-report.html'));
});

test('getReportPath uses exact string equality for format parameter', () => {
  // The function uses strict === comparison, so case matters
  assert.equal(getReportPath('html'), path.join('.', 'review-report.html'));
  assert.equal(getReportPath('HTML'), path.join('.', 'review-report.json'));
  assert.equal(getReportPath('json'), path.join('.', 'review-report.json'));
  assert.equal(getReportPath('JSON'), path.join('.', 'review-report.json'));
});

test('getReportPath returns json for unknown format values', () => {
  // Unknown format falls back to json extension
  const result = getReportPath('pdf');
  assert.equal(result, path.join('.', 'review-report.json'));
});
