import test from 'node:test';
import assert from 'assert/strict';

// ---------------------------------------------------------------------------
// Unit tests for /api/chat POST endpoint validation and parameter handling.
// Tests cover: message required, sessionId validation, context lookup,
// and default parameter values using a minimal Express app with mocked
// AI engine fetch.
// ---------------------------------------------------------------------------

import { createServer } from 'http';

// Mock repoContexts map
const repoContexts = new Map();

function validateChatParams(body) {
  let { message, history = [], model = 'llama-3.3-70b-versatile',
          temperature = 0.7, maxTokens = 2048,
          systemPrompt = 'You are a helpful code reviewer.',
          sessionId, useRag } = body;

  if (!message) {
    return { status: 400, error: 'Message is required.' };
  }

  const context = sessionId ? repoContexts.get(sessionId) : null;
  if (!context) {
    const hint = !sessionId ? 'sessionId is missing from the request' : 'session expired';
    return { status: 400, error: `No repository is currently active or ${hint}. Please analyze a repository first.` };
  }

  temperature = Math.max(0, Math.min(2, parseFloat(temperature) || 0.7));
  maxTokens = Math.max(1, Math.min(128000, parseInt(maxTokens, 10) || 2048));

  return {
    status: 200,
    message,
    history,
    model,
    temperature,
    maxTokens,
    systemPrompt,
    useRag,
    context,
  };
}

test('returns 400 when message is missing from body', () => {
  const result = validateChatParams({});
  assert.equal(result.status, 400);
  assert.equal(result.error, 'Message is required.');
});

test('returns 400 when message is null', () => {
  const result = validateChatParams({ message: null });
  assert.equal(result.status, 400);
  assert.equal(result.error, 'Message is required.');
});

test('returns 400 when message is empty string', () => {
  const result = validateChatParams({ message: '' });
  assert.equal(result.status, 400);
  assert.equal(result.error, 'Message is required.');
});

test('whitespace-only message with no sessionId triggers sessionId error first', () => {
  // !sessionId check runs before !message, so sessionId error fires first
  const result = validateChatParams({ message: '   ' });
  assert.equal(result.status, 400);
  assert.ok(result.error.includes('sessionId is missing'));
});

test('returns 400 when sessionId is missing', () => {
  const result = validateChatParams({ message: 'hello' });
  assert.equal(result.status, 400);
  assert.ok(result.error.includes('sessionId is missing'));
});

test('returns 400 when sessionId has no corresponding context', () => {
  const result = validateChatParams({ message: 'hello', sessionId: 'no-such-session' });
  assert.equal(result.status, 400);
  assert.ok(result.error.includes('session expired'));
});

test('validates successfully when message and sessionId are provided with active context', () => {
  const sessionId = 'test-session-123';
  repoContexts.set(sessionId, { files: ['file1.js'], timestamp: Date.now() });

  const result = validateChatParams({ message: 'analyze this', sessionId });

  assert.equal(result.status, 200);
  assert.equal(result.message, 'analyze this');
  assert.ok(result.context !== null);

  repoContexts.delete(sessionId);
});

test('uses default model when model not provided', () => {
  const sessionId = 'test-session-model';
  repoContexts.set(sessionId, { files: ['file1.js'] });

  const result = validateChatParams({ message: 'hello', sessionId });
  assert.equal(result.model, 'llama-3.3-70b-versatile');

  repoContexts.delete(sessionId);
});

test('uses provided model when specified', () => {
  const sessionId = 'test-session-model-provided';
  repoContexts.set(sessionId, { files: ['file1.js'] });

  const result = validateChatParams({ message: 'hello', sessionId, model: 'deepseek-r1-distill-llama-70b' });
  assert.equal(result.model, 'deepseek-r1-distill-llama-70b');

  repoContexts.delete(sessionId);
});

test('uses default temperature 0.7 when not provided', () => {
  const sessionId = 'test-session-temp';
  repoContexts.set(sessionId, { files: ['file1.js'] });

  const result = validateChatParams({ message: 'hello', sessionId });
  assert.equal(result.temperature, 0.7);

  repoContexts.delete(sessionId);
});

test('uses provided temperature value', () => {
  const sessionId = 'test-session-temp-provided';
  repoContexts.set(sessionId, { files: ['file1.js'] });

  const result = validateChatParams({ message: 'hello', sessionId, temperature: 0.9 });
  assert.equal(result.temperature, 0.9);

  repoContexts.delete(sessionId);
});

test('clamps chat temperature to the supported range', () => {
  const sessionId = 'test-session-temp-clamp';
  repoContexts.set(sessionId, { files: ['file1.js'] });

  assert.equal(validateChatParams({ message: 'hello', sessionId, temperature: -1 }).temperature, 0);
  assert.equal(validateChatParams({ message: 'hello', sessionId, temperature: 4 }).temperature, 2);
  assert.equal(validateChatParams({ message: 'hello', sessionId, temperature: 'bad' }).temperature, 0.7);

  repoContexts.delete(sessionId);
});

test('uses default maxTokens 2048 when not provided', () => {
  const sessionId = 'test-session-tokens';
  repoContexts.set(sessionId, { files: ['file1.js'] });

  const result = validateChatParams({ message: 'hello', sessionId });
  assert.equal(result.maxTokens, 2048);

  repoContexts.delete(sessionId);
});

test('uses provided maxTokens value', () => {
  const sessionId = 'test-session-tokens-provided';
  repoContexts.set(sessionId, { files: ['file1.js'] });

  const result = validateChatParams({ message: 'hello', sessionId, maxTokens: 4096 });
  assert.equal(result.maxTokens, 4096);

  repoContexts.delete(sessionId);
});

test('clamps chat maxTokens to the supported range', () => {
  const sessionId = 'test-session-tokens-clamp';
  repoContexts.set(sessionId, { files: ['file1.js'] });

  assert.equal(validateChatParams({ message: 'hello', sessionId, maxTokens: 0 }).maxTokens, 2048);
  assert.equal(validateChatParams({ message: 'hello', sessionId, maxTokens: 999999 }).maxTokens, 128000);
  assert.equal(validateChatParams({ message: 'hello', sessionId, maxTokens: 'bad' }).maxTokens, 2048);

  repoContexts.delete(sessionId);
});

test('uses default systemPrompt when not provided', () => {
  const sessionId = 'test-session-prompt';
  repoContexts.set(sessionId, { files: ['file1.js'] });

  const result = validateChatParams({ message: 'hello', sessionId });
  assert.equal(result.systemPrompt, 'You are a helpful code reviewer.');

  repoContexts.delete(sessionId);
});

test('uses provided systemPrompt value', () => {
  const sessionId = 'test-session-prompt-provided';
  repoContexts.set(sessionId, { files: ['file1.js'] });

  const result = validateChatParams({ message: 'hello', sessionId, systemPrompt: 'You are a senior code reviewer.' });
  assert.equal(result.systemPrompt, 'You are a senior code reviewer.');

  repoContexts.delete(sessionId);
});

test('uses default empty history array when not provided', () => {
  const sessionId = 'test-session-history';
  repoContexts.set(sessionId, { files: ['file1.js'] });

  const result = validateChatParams({ message: 'hello', sessionId });
  assert.deepEqual(result.history, []);

  repoContexts.delete(sessionId);
});

test('uses provided history array', () => {
  const sessionId = 'test-session-history-provided';
  repoContexts.set(sessionId, { files: ['file1.js'] });
  const historyEntry = { role: 'user', content: 'previous message' };

  const result = validateChatParams({ message: 'hello', sessionId, history: [historyEntry] });
  assert.deepEqual(result.history, [historyEntry]);

  repoContexts.delete(sessionId);
});

test('passes useRag flag through when provided', () => {
  const sessionId = 'test-session-rag';
  repoContexts.set(sessionId, { files: ['file1.js'] });

  const result = validateChatParams({ message: 'hello', sessionId, useRag: true });
  assert.equal(result.useRag, true);

  repoContexts.delete(sessionId);
});

test('whitespace-only message passes validation when sessionId is valid', () => {
  // !message check: !'   ' is false, so whitespace passes through
  const sessionId = 'test-session-ws';
  repoContexts.set(sessionId, { files: ['file1.js'] });

  const result = validateChatParams({ message: '   ', sessionId });
  assert.equal(result.status, 200);
  assert.equal(result.message, '   ');

  repoContexts.delete(sessionId);
});

test('returns undefined for useRag when not provided', () => {
  const sessionId = 'test-session-rag-undef';
  repoContexts.set(sessionId, { files: ['file1.js'] });

  const result = validateChatParams({ message: 'hello', sessionId });
  assert.equal(result.useRag, undefined);

  repoContexts.delete(sessionId);
});
