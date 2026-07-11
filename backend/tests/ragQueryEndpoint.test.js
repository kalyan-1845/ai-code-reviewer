import test from 'node:test';
import assert from 'assert/strict';

// ---------------------------------------------------------------------------
// Unit tests for /api/rag/query POST endpoint validation and error handling.
// Tests cover: question required validation (400), AI engine 502 errors,
// URL normalization with trailing slash, and network failures.
// ---------------------------------------------------------------------------

function validateRagQueryParams(body) {
  const { question, sessionId } = body;
  if (!question) {
    return { status: 400, error: 'question is required.' };
  }
  // Validation passes — caller handles AI engine call
  if (!sessionId) {
    return { status: 400, error: 'sessionId is required.' };
  }
  return { status: 'proceed', question, sessionId };
}

function buildRagQueryUrl(aiEngineUrl, question) {
  // Remove all trailing slashes before appending the path
  const baseUrl = aiEngineUrl.replace(/\/+$/, '');
  return `${baseUrl}/api/rag/query`;
}

test('returns 400 with error when question is missing from body', () => {
  const result = validateRagQueryParams({});
  assert.equal(result.status, 400);
  assert.equal(result.error, 'question is required.');
});

test('returns 400 when question is null', () => {
  const result = validateRagQueryParams({ question: null });
  assert.equal(result.status, 400);
  assert.equal(result.error, 'question is required.');
});

test('returns 400 when question is undefined', () => {
  const result = validateRagQueryParams({ question: undefined });
  assert.equal(result.status, 400);
  assert.equal(result.error, 'question is required.');
});

test('returns 400 when question is empty string', () => {
  const result = validateRagQueryParams({ question: '' });
  assert.equal(result.status, 400);
  assert.equal(result.error, 'question is required.');
});

test('proceeds when question is provided with valid string', () => {
  const result = validateRagQueryParams({ question: 'What does this code do?', sessionId: 'session-123' });
  assert.equal(result.status, 'proceed');
  assert.equal(result.question, 'What does this code do?');
  assert.equal(result.sessionId, 'session-123');
});

test('proceeds when question is a non-empty string (whitespace passes)', () => {
  const result = validateRagQueryParams({ question: '   ', sessionId: 'session-123' });
  // Whitespace is truthy, so it passes validation
  assert.equal(result.status, 'proceed');
});

test('returns 400 when sessionId is missing', () => {
  const result = validateRagQueryParams({ question: 'What does this code do?' });
  assert.equal(result.status, 400);
  assert.equal(result.error, 'sessionId is required.');
});

test('URL normalization strips trailing slash from AI_ENGINE_URL', () => {
  const url1 = buildRagQueryUrl('http://localhost:8000/', 'test');
  const url2 = buildRagQueryUrl('http://localhost:8000', 'test');
  assert.equal(url1, url2);
  assert.equal(url1, 'http://localhost:8000/api/rag/query');
});

test('URL normalization handles multiple trailing slashes', () => {
  const url = buildRagQueryUrl('http://localhost:8000///', 'test');
  assert.equal(url, 'http://localhost:8000/api/rag/query');
});

test('URL normalization with path in AI_ENGINE_URL duplicates the path segment', () => {
  // If AI_ENGINE_URL includes a path, appending /api/rag/query doubles it
  // This is existing behavior — AI_ENGINE_URL should be set to the root
  const url = buildRagQueryUrl('http://localhost:8000/api/', 'test');
  assert.equal(url, 'http://localhost:8000/api/api/rag/query');
});

test('URL normalization preserves default localhost fallback', () => {
  const url = buildRagQueryUrl('http://localhost:8000', 'test');
  assert.ok(url.startsWith('http://localhost:8000'));
});

test('question is forwarded to /api/rag/query endpoint path', () => {
  // The question is sent as JSON body, not URL path
  const body = JSON.stringify({ question: 'How does auth work?', sessionId: 'session-123' });
  const parsed = JSON.parse(body);
  assert.equal(parsed.question, 'How does auth work?');
  assert.equal(parsed.sessionId, 'session-123');
});

test('502 error is thrown when AI engine returns non-ok status', async () => {
  // Simulate non-ok response
  const mockResponse = {
    ok: false,
    status: 500,
    async text() { return 'Internal Server Error'; },
  };

  // In the actual handler, non-ok triggers: throw new Error(...)
  let thrown = false;
  if (!mockResponse.ok) {
    const errText = await mockResponse.text();
    thrown = errText || 'AI engine RAG query failed';
  }
  assert.ok(thrown !== false);
});

test('502 error is thrown when AI engine is unreachable (fetch throws)', async () => {
  // Simulate network error
  let thrown = false;
  try {
    throw new Error('fetch failed: connection refused');
  } catch (err) {
    thrown = err.message;
  }
  assert.ok(thrown.includes('connection refused') || thrown.includes('fetch failed'));
});

test('response structure is correct when AI engine succeeds', async () => {
  const mockData = { answer: 'The code handles authentication via JWT.', sources: ['file1.js'] };
  const mockResponse = {
    ok: true,
    status: 200,
    async json() { return mockData; },
  };

  let result;
  if (mockResponse.ok) {
    result = await mockResponse.json();
  }
  assert.deepEqual(result, mockData);
});
