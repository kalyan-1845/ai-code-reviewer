import test from 'node:test';
import assert from 'assert/strict';

import { resolveAiEngineUrl } from '../utils/aiEngineClient.js';

test('accepts https AI engine urls', () => {
  const { url, warnings } = resolveAiEngineUrl('https://ai.example.com/v1/');
  assert.equal(url, 'https://ai.example.com/v1');
  assert.deepEqual(warnings, []);
});

test('accepts loopback http (localhost), the safe local-dev default', () => {
  const { url, warnings } = resolveAiEngineUrl('http://localhost:8000');
  assert.equal(url, 'http://localhost:8000');
  assert.deepEqual(warnings, []);
});

test('accepts 127.0.0.1 and ::1 loopback', () => {
  assert.deepEqual(resolveAiEngineUrl('http://127.0.0.1:8000').warnings, []);
  assert.deepEqual(resolveAiEngineUrl('http://[::1]:8000').warnings, []);
});

test('rejects cleartext http to a non-loopback host', () => {
  const { url, warnings } = resolveAiEngineUrl('http://ai.private.corp:8000');
  assert.equal(url, 'http://localhost:8000');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /AI_ENGINE_URL must use https or loopback/);
});

test('falls back cleanly when AI_ENGINE_URL is unset', () => {
  const { url, warnings } = resolveAiEngineUrl('');
  assert.equal(url, 'http://localhost:8000');
  assert.deepEqual(warnings, []);
});

test('strips trailing slashes', () => {
  const { url } = resolveAiEngineUrl('https://ai.example.com//');
  assert.equal(url, 'https://ai.example.com');
});

test('rejects an invalid URL value', () => {
  const { url, warnings } = resolveAiEngineUrl('not a url');
  assert.notEqual(url, 'not a url');
  assert.equal(warnings.length, 1);
});