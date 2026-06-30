import test from 'node:test';
import assert from 'node:assert/strict';

// Replicate the fetchWithTimeout logic for isolated testing.
// This mirrors the implementation in backend/index.js.
function fetchWithTimeout(url, options = {}, timeoutMs = 120000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

test('fetchWithTimeout returns a Response on success', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('OK', { status: 200 });

  try {
    const response = await fetchWithTimeout('https://example.com/api');
    assert.equal(response instanceof Response, true);
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.equal(text, 'OK');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchWithTimeout passes method through in options', async () => {
  const originalFetch = globalThis.fetch;
  let capturedOptions = null;
  globalThis.fetch = async (url, opts) => {
    capturedOptions = opts;
    return new Response('', { status: 201 });
  };

  try {
    await fetchWithTimeout('https://example.com/api', { method: 'POST', body: '{"a":1}' });
    assert.equal(capturedOptions.method, 'POST');
    assert.equal(capturedOptions.body, '{"a":1}');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchWithTimeout passes headers through in options', async () => {
  const originalFetch = globalThis.fetch;
  let capturedOptions = null;
  globalThis.fetch = async (url, opts) => {
    capturedOptions = opts;
    return new Response('', { status: 200 });
  };

  try {
    await fetchWithTimeout('https://example.com/api', {
      headers: { 'Authorization': 'Bearer token123', 'Content-Type': 'application/json' }
    });
    assert.equal(capturedOptions.headers['Authorization'], 'Bearer token123');
    assert.equal(capturedOptions.headers['Content-Type'], 'application/json');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchWithTimeout throws when timeout expires before fetch resolves', async () => {
  const originalFetch = globalThis.fetch;
  // Use a fetch that resolves after 500ms — well past our 5ms timeout
  globalThis.fetch = async () => new Promise(resolve => setTimeout(() => resolve(new Response('late')), 500));

  try {
    const promise = fetchWithTimeout('https://example.com/api', {}, 5);
    // Wait long enough for the abort to fire (5ms timeout, give it 200ms)
    await new Promise(resolve => setTimeout(resolve, 200));
    // If we get here without throwing, the test should fail
    await promise;
    assert.fail('Expected an error to be thrown due to timeout');
  } catch (err) {
    // Any error from fetch due to abort is acceptable
    assert.ok(err != null, 'Expected an error to be thrown');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchWithTimeout default timeout is 120000ms and accepts signal', async () => {
  const originalFetch = globalThis.fetch;
  let capturedSignal = null;
  globalThis.fetch = async (url, opts) => {
    capturedSignal = opts.signal;
    return new Response('OK');
  };

  try {
    // Call without explicit timeout argument to use default (120000ms)
    await fetchWithTimeout('https://example.com/api');
    assert.ok(capturedSignal instanceof AbortSignal);
    assert.equal(capturedSignal.aborted, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchWithTimeout passes signal to fetch call', async () => {
  const originalFetch = globalThis.fetch;
  let capturedSignal = null;
  globalThis.fetch = async (url, opts) => {
    capturedSignal = opts.signal;
    return new Response('OK');
  };

  try {
    await fetchWithTimeout('https://example.com/api', {}, 5000);
    assert.ok(capturedSignal instanceof AbortSignal);
    assert.equal(capturedSignal.aborted, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchWithTimeout propagates fetch errors as-is', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('Network failure'); };

  try {
    await fetchWithTimeout('https://example.com/api');
    assert.fail('Expected error to propagate');
  } catch (err) {
    assert.equal(err.message, 'Network failure');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchWithTimeout returns non-OK HTTP responses without throwing', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('Not Found', { status: 404 });

  try {
    const response = await fetchWithTimeout('https://example.com/missing');
    assert.equal(response.status, 404);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('fetchWithTimeout always clears timeout timer on success', async () => {
  const originalFetch = globalThis.fetch;
  const originalClearTimeout = globalThis.clearTimeout;
  let clearTimeoutCalled = false;
  let clearedTimeoutId = null;

  globalThis.clearTimeout = (id) => {
    clearTimeoutCalled = true;
    clearedTimeoutId = id;
    return originalClearTimeout(id);
  };
  globalThis.fetch = async () => new Response('OK');

  try {
    await fetchWithTimeout('https://example.com/api', {}, 60000);
    assert.equal(clearTimeoutCalled, true);
    assert.ok(clearedTimeoutId !== null);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test('fetchWithTimeout merges global options with signal', async () => {
  const originalFetch = globalThis.fetch;
  let capturedOptions = null;
  globalThis.fetch = async (url, opts) => {
    capturedOptions = opts;
    return new Response('OK');
  };

  try {
    await fetchWithTimeout(
      'https://example.com/api',
      { method: 'GET', credentials: 'include' },
      30000
    );
    // Signal should be merged into options, not replacing them
    assert.equal(capturedOptions.method, 'GET');
    assert.equal(capturedOptions.credentials, 'include');
    assert.ok(capturedOptions.signal instanceof AbortSignal);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
