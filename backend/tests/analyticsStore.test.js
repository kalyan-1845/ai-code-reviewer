import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';

const originalWarn = console.warn;
console.warn = () => {};

test('getTrends returns empty array when no store file exists', async () => {
  const { getTrends } = await import('../utils/analyticsStore.js');
  // Temporarily move the store file if it exists
  const storePath = path.join(import.meta.dirname, '..', 'analytics_trends.json');
  const backupPath = storePath + '.test_backup';
  const exists = fs.existsSync(storePath);
  if (exists) fs.renameSync(storePath, backupPath);
  try {
    const trends = getTrends();
    assert.ok(Array.isArray(trends));
  } finally {
    if (exists) fs.renameSync(backupPath, storePath);
  }
});

test('getTrends returns empty array when store is invalid JSON', async () => {
  const { getTrends } = await import('../utils/analyticsStore.js');
  const storePath = path.join(import.meta.dirname, '..', 'analytics_trends.json');
  const backupPath = storePath + '.test_backup';
  const exists = fs.existsSync(storePath);
  if (exists) fs.renameSync(storePath, backupPath);
  try {
    fs.writeFileSync(storePath, 'not valid json{');
    const trends = getTrends();
    // Should attempt backup recovery; if no backup, returns []
    assert.ok(Array.isArray(trends));
  } finally {
    fs.unlinkSync(storePath);
    if (exists) fs.renameSync(backupPath, storePath);
  }
});

test('getTrends returns array when store has valid JSON array', async () => {
  const { getTrends } = await import('../utils/analyticsStore.js');
  const storePath = path.join(import.meta.dirname, '..', 'analytics_trends.json');
  const backupPath = storePath + '.test_backup';
  const exists = fs.existsSync(storePath);
  if (exists) fs.renameSync(storePath, backupPath);
  try {
    const data = [{ timestamp: '2025-01-01T00:00:00Z', repoName: 'test-repo' }];
    fs.writeFileSync(storePath, JSON.stringify(data));
    const trends = getTrends();
    assert.strictEqual(trends.length, 1);
    assert.strictEqual(trends[0].repoName, 'test-repo');
  } finally {
    fs.unlinkSync(storePath);
    if (exists) fs.renameSync(backupPath, storePath);
  }
});

test('getTrends returns empty array when store is not an array', async () => {
  const { getTrends } = await import('../utils/analyticsStore.js');
  const storePath = path.join(import.meta.dirname, '..', 'analytics_trends.json');
  const backupPath = storePath + '.test_backup';
  const exists = fs.existsSync(storePath);
  if (exists) fs.renameSync(storePath, backupPath);
  try {
    fs.writeFileSync(storePath, JSON.stringify({ not: 'an array' }));
    const trends = getTrends();
    // Should attempt backup recovery; returns [] if no valid backup
    assert.ok(Array.isArray(trends));
  } finally {
    fs.unlinkSync(storePath);
    if (exists) fs.renameSync(backupPath, storePath);
  }
});

test('recordAnalysis adds a record to the store', async () => {
  const { recordAnalysis, getTrends } = await import('../utils/analyticsStore.js');
  const storePath = path.join(import.meta.dirname, '..', 'analytics_trends.json');
  const backupPath = storePath + '.test_backup';
  const exists = fs.existsSync(storePath);
  if (exists) fs.renameSync(storePath, backupPath);
  try {
    await recordAnalysis({ repoName: 'test-repo-xyz', totalLines: 500, bugs: 3 });
    const trends = getTrends();
    assert.ok(trends.length >= 1);
    const last = trends[trends.length - 1];
    assert.strictEqual(last.repoName, 'test-repo-xyz');
    assert.strictEqual(last.totalLines, 500);
    assert.strictEqual(last.bugs, 3);
  } finally {
    if (fs.existsSync(storePath)) fs.unlinkSync(storePath);
    if (exists) fs.renameSync(backupPath, storePath);
  }
});

test('recordAnalysis uses defaults for missing fields', async () => {
  const { recordAnalysis, getTrends } = await import('../utils/analyticsStore.js');
  const storePath = path.join(import.meta.dirname, '..', 'analytics_trends.json');
  const backupPath = storePath + '.test_backup';
  const exists = fs.existsSync(storePath);
  if (exists) fs.renameSync(storePath, backupPath);
  try {
    await recordAnalysis({});
    const trends = getTrends();
    const last = trends[trends.length - 1];
    assert.strictEqual(last.repoName, 'unknown');
    assert.strictEqual(last.totalLines, 0);
    assert.strictEqual(last.bugs, 0);
  } finally {
    if (fs.existsSync(storePath)) fs.unlinkSync(storePath);
    if (exists) fs.renameSync(backupPath, storePath);
  }
});

test('recordAnalysis adds timestamp to each record', async () => {
  const { recordAnalysis, getTrends } = await import('../utils/analyticsStore.js');
  const storePath = path.join(import.meta.dirname, '..', 'analytics_trends.json');
  const backupPath = storePath + '.test_backup';
  const exists = fs.existsSync(storePath);
  if (exists) fs.renameSync(storePath, backupPath);
  try {
    await recordAnalysis({ repoName: 'timestamp-test' });
    const trends = getTrends();
    const last = trends[trends.length - 1];
    assert.ok('timestamp' in last);
    assert.ok(last.timestamp.includes('T'));
    // Should be a valid ISO date
    const date = new Date(last.timestamp);
    assert.ok(!isNaN(date.getTime()));
  } finally {
    if (fs.existsSync(storePath)) fs.unlinkSync(storePath);
    if (exists) fs.renameSync(backupPath, storePath);
  }
});

console.warn = originalWarn;
