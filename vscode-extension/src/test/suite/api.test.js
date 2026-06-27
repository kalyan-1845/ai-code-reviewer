'use strict';

// api.test.js
// Tests for the VSCode extension API client in src/api.ts.
// Uses the vscode stub from ../vscode-stub.js (loaded via vscode-preload.js)
// and mocks global fetch to test the HTTP layer.

const assert = require('assert');

// ---------------------------------------------------------------------------
// Fetch mock
// ---------------------------------------------------------------------------
let mockFetchCalled = false;
let mockFetchUrl = '';
let mockFetchOptions = {};
let mockFetchResponse = null;
let mockFetchError = null;

function setupFetchMock(response, error) {
  mockFetchCalled = false;
  mockFetchUrl = '';
  mockFetchOptions = {};
  mockFetchResponse = response || null;
  mockFetchError = error || null;
  // Save original fetch if set
  global.fetch = function (url, options) {
    mockFetchCalled = true;
    mockFetchUrl = url;
    mockFetchOptions = options || {};
    if (mockFetchError) {
      return Promise.reject(mockFetchError);
    }
    return Promise.resolve({
      ok: mockFetchResponse ? (mockFetchResponse.ok !== undefined ? mockFetchResponse.ok : true) : true,
      status: mockFetchResponse ? (mockFetchResponse.status || 200) : 200,
      json: () => Promise.resolve(mockFetchResponse ? mockFetchResponse.body : {}),
      text: () => Promise.resolve(mockFetchResponse ? (mockFetchResponse.bodyText || '') : ''),
    });
  };
}

function resetFetchMock() {
  delete global.fetch;
}

// ---------------------------------------------------------------------------
// Import compiled api module (compiled by esbuild to out/ directory)
// ---------------------------------------------------------------------------
const api = require('../../../out/api');

// ---------------------------------------------------------------------------
// VSCode stub helpers
// ---------------------------------------------------------------------------
let vscodeStub = null;
try {
  vscodeStub = require('../vscode-stub.js');
} catch (e) {
  // stub not available via require
}

function setApiUrl(url) {
  if (vscodeStub) vscodeStub.setApiUrl(url);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
suite('api.ts - reviewFileContent', function () {

  teardown(function () {
    resetFetchMock();
    if (vscodeStub) vscodeStub.reset();
  });

  test('calls fetch with correct endpoint /api/analyze', async function () {
    setupFetchMock({ ok: true, status: 200, body: { analysis: {} } }, null);
    setApiUrl('http://localhost:5000');

    await api.reviewFileContent('test.js', 'const x = 1;', 'test-key');

    assert.strictEqual(mockFetchCalled, true, 'fetch should have been called');
    assert.ok(mockFetchUrl.includes('/api/analyze'),
      'Expected URL to contain /api/analyze, got: ' + mockFetchUrl);
  });

  test('sets Content-Type application/json header', async function () {
    setupFetchMock({ ok: true, status: 200, body: {} }, null);
    setApiUrl('http://localhost:5000');

    await api.reviewFileContent('test.js', 'const x = 1;', '');

    assert.strictEqual(mockFetchOptions.headers['Content-Type'], 'application/json',
      'Content-Type should be application/json');
  });

  test('sets x-api-key header when apiKey is provided', async function () {
    setupFetchMock({ ok: true, status: 200, body: {} }, null);
    setApiUrl('http://localhost:5000');

    await api.reviewFileContent('test.js', 'const x = 1;', 'my-secret-key');

    assert.strictEqual(mockFetchOptions.headers['x-api-key'], 'my-secret-key',
      'x-api-key header should match the provided apiKey');
  });

  test('does not set x-api-key header when apiKey is empty string', async function () {
    setupFetchMock({ ok: true, status: 200, body: {} }, null);
    setApiUrl('http://localhost:5000');

    await api.reviewFileContent('test.js', 'const x = 1;', '');

    assert.strictEqual(mockFetchOptions.headers['x-api-key'], undefined,
      'x-api-key should not be set when apiKey is empty');
  });

  test('returns success=true on 200 OK response', async function () {
    const mockBody = { analysis: { fileReviews: {} } };
    setupFetchMock({ ok: true, status: 200, body: mockBody }, null);
    setApiUrl('http://localhost:5000');

    const result = await api.reviewFileContent('test.js', 'code', 'key');

    assert.strictEqual(result.success, true, 'success should be true');
    assert.ok(result.response !== undefined, 'response should be present');
  });

  test('returns success=false with error on non-200 response', async function () {
    setupFetchMock({ ok: false, status: 400, bodyText: 'Bad Request' }, null);
    setApiUrl('http://localhost:5000');

    const result = await api.reviewFileContent('test.js', 'code', '');

    assert.strictEqual(result.success, false, 'success should be false');
    assert.ok(result.error !== undefined, 'error should be present');
    assert.ok(result.error.includes('400') || result.error.includes('API error'),
      'error should mention status code, got: ' + result.error);
  });

  test('returns success=false when fetch throws network error', async function () {
    setupFetchMock(null, new Error('ENOTFOUND'));
    setApiUrl('http://localhost:5000');

    const result = await api.reviewFileContent('test.js', 'code', '');

    assert.strictEqual(result.success, false, 'success should be false on network error');
    assert.ok(result.error !== undefined, 'error should be present on network error');
    assert.ok(result.error.includes('ENOTFOUND'),
      'error should mention network failure, got: ' + result.error);
  });

  test('sends correct request body with fileName, code, company, language, model', async function () {
    setupFetchMock({ ok: true, status: 200, body: {} }, null);
    setApiUrl('http://localhost:5000');

    await api.reviewFileContent('myfile.ts', 'const x = 42;', '');

    assert.strictEqual(mockFetchCalled, true);
    const sentBody = JSON.parse(mockFetchOptions.body);
    assert.strictEqual(sentBody.code, 'const x = 42;');
    assert.strictEqual(sentBody.fileName, 'myfile.ts');
    assert.strictEqual(sentBody.company, 'General');
    assert.strictEqual(sentBody.language, 'English');
    assert.strictEqual(sentBody.model, 'llama-3.3-70b-versatile');
  });

  test('uses apiUrl from vscode workspace configuration', async function () {
    setupFetchMock({ ok: true, status: 200, body: {} }, null);
    setApiUrl('https://custom-backend.example.com:9000');

    await api.reviewFileContent('test.js', 'code', '');

    assert.ok(mockFetchUrl.startsWith('https://custom-backend.example.com:9000'),
      'Expected URL to start with configured apiUrl, got: ' + mockFetchUrl);
  });

  test('returns response as stringified JSON', async function () {
    const mockBody = { foo: 'bar', num: 42 };
    setupFetchMock({ ok: true, status: 200, body: mockBody }, null);
    setApiUrl('http://localhost:5000');

    const result = await api.reviewFileContent('test.js', 'code', '');

    assert.strictEqual(result.success, true);
    const parsed = JSON.parse(result.response);
    assert.strictEqual(parsed.foo, 'bar');
    assert.strictEqual(parsed.num, 42);
  });
});
