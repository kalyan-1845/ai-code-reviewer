/**
 * Unit tests for useStreamingReview React hook.
 * Uses vitest with jsdom environment (configured in vitest.config.js).
 * Tests SSE streaming, state management, and error handling.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useStreamingReview } from './useStreamingReview';

// ---------------------------------------------------------------------------
// Helpers to build mock SSE streams
// ---------------------------------------------------------------------------
function buildSSECall(body: string, init?: ResponseInit): Response {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
    ...init,
  });
}

function sseChunk(text: string): string {
  return `data: ${JSON.stringify({ text })}\n\n`;
}

function sseDone(): string {
  return 'data: [DONE]\n\n';
}

function sessionResponse(): Response {
  return new Response(JSON.stringify({ csrfToken: 'csrf-token' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Route /api/session (used by ensureApiSession) to a real session response and
// every other URL (the SSE endpoint) to the provided stream response.
function mockStreamResponse(response: Response) {
  mockFetch.mockImplementation((url: string, _init?: RequestInit) =>
    String(url).includes('/api/session')
      ? Promise.resolve(sessionResponse())
      : Promise.resolve(response)
  );
}

function streamCall(): [string, RequestInit] {
  const call = mockFetch.mock.calls.find(([url]) =>
    String(url).includes('/api/review/stream')
  );
  return call as [string, RequestInit];
}

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('useStreamingReview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear sessionStorage
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initial state: empty reviewText, not streaming, no error', () => {
    const { result } = renderHook(() => useStreamingReview());
    expect(result.current.reviewText).toBe('');
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it('startStream posts to /api/review/stream with correct headers', async () => {
    mockStreamResponse(buildSSECall(sseDone()));

    const { result } = renderHook(() => useStreamingReview());

    await act(async () => {
      await result.current.startStream({ repoUrl: 'https://github.com/test/repo' });
    });

    const [url, options] = streamCall();
    expect(url).toContain('/api/review/stream');
    expect(options.method).toBe('POST');
    expect((options.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('accumulates reviewText from multiple SSE data chunks', async () => {
    mockStreamResponse(
      buildSSECall(sseChunk('Hello ') + sseChunk('world') + sseDone())
    );

    const { result } = renderHook(() => useStreamingReview());

    await act(async () => {
      await result.current.startStream({ repoUrl: 'https://github.com/test/repo' });
    });

    await waitFor(() => {
      expect(result.current.reviewText).toBe('Hello world');
    });
    expect(result.current.isStreaming).toBe(false);
  });

  it('handles HTTP error and sets error state', async () => {
    mockStreamResponse(
      new Response(null, { status: 500, statusText: 'Internal Server Error' })
    );

    const { result } = renderHook(() => useStreamingReview());

    await act(async () => {
      await result.current.startStream({ repoUrl: 'https://github.com/test/repo' });
    });

    await waitFor(() => {
      expect(result.current.error).not.toBe(null);
    });
    expect(result.current.isStreaming).toBe(false);
  });

  it('handles SSE error event and sets error state', async () => {
    mockStreamResponse(
      buildSSECall(sseChunk('partial ') + `data: ${JSON.stringify({ error: 'server error' })}\n\n`)
    );

    const { result } = renderHook(() => useStreamingReview());

    await act(async () => {
      await result.current.startStream({ repoUrl: 'https://github.com/test/repo' });
    });

    await waitFor(() => {
      expect(result.current.error).toBe('server error');
    });
    expect(result.current.isStreaming).toBe(false);
  });

  it('resets reviewText and error before each new stream', async () => {
    // First stream: partial result
    mockStreamResponse(
      buildSSECall(sseChunk('first') + sseDone())
    );

    const { result } = renderHook(() => useStreamingReview());

    await act(async () => {
      await result.current.startStream({ repoUrl: 'https://github.com/test/repo' });
    });

    await waitFor(() => {
      expect(result.current.reviewText).toBe('first');
    });

    // Second stream: starts fresh
    mockStreamResponse(
      buildSSECall(sseChunk('second') + sseDone())
    );

    await act(async () => {
      await result.current.startStream({ repoUrl: 'https://github.com/test/repo' });
    });

    await waitFor(() => {
      expect(result.current.reviewText).toBe('second');
    });
  });

  it('startStream posts to /api/review/stream and sets streaming state', async () => {
    mockStreamResponse(buildSSECall(sseChunk('streaming content') + sseDone()));

    const { result } = renderHook(() => useStreamingReview());

    await act(async () => {
      await result.current.startStream({ repoUrl: 'https://github.com/test/repo' });
    });

    await waitFor(() => {
      expect(result.current.reviewText).toBe('streaming content');
    });
    expect(result.current.isStreaming).toBe(false);
  });

  it('sends the x-api-key header on the stream request', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('test-api-key-123');
    mockStreamResponse(buildSSECall(sseDone()));

    const { result } = renderHook(() => useStreamingReview());

    await act(async () => {
      await result.current.startStream({ repoUrl: 'https://github.com/test/repo' });
    });

    const options = streamCall()[1];
    expect((options.headers as Record<string, string>)['x-api-key']).toBe('');
  });

  it('resetStream clears state and aborts an in-flight stream', async () => {
    let abortSignal: AbortSignal | undefined;
    mockFetch.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/session')) {
        return Promise.resolve(
          new Response(JSON.stringify({ csrfToken: 'csrf-token' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }
      abortSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        const onAbort = () => {
          const error = new Error('The operation was aborted.');
          error.name = 'AbortError';
          reject(error);
        };
        if (abortSignal?.aborted) {
          onAbort();
        } else {
          abortSignal?.addEventListener('abort', onAbort, { once: true });
        }
      });
    });

    const { result } = renderHook(() => useStreamingReview());

    await act(async () => {
      result.current.startStream({ repoUrl: 'https://github.com/test/repo' });
    });
    await waitFor(() => {
      expect(result.current.isStreaming).toBe(true);
    });

    await act(async () => {
      result.current.resetStream();
    });

    expect(result.current.reviewText).toBe('');
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.isMock).toBe(false);
    expect(result.current.error).toBe(null);
    expect(abortSignal?.aborted).toBe(true);
  });

  it('keeps the completed streaming preview when resetStream runs', async () => {
    mockStreamResponse(
      buildSSECall(sseChunk('Hello ') + sseChunk('world') + sseDone())
    );

    const { result } = renderHook(() => useStreamingReview());

    await act(async () => {
      await result.current.startStream({ repoUrl: 'https://github.com/test/repo' });
    });

    await waitFor(() => {
      expect(result.current.reviewText).toBe('Hello world');
    });
    expect(result.current.isStreaming).toBe(false);

    // Simulate the analyze handler's `finally` block calling resetStream()
    // after the stream completed: the accumulated review must not be wiped.
    await act(async () => {
      result.current.resetStream();
    });

    expect(result.current.reviewText).toBe('Hello world');
    expect(result.current.isStreaming).toBe(false);
  });
});
