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
    mockFetch.mockResolvedValue(
      buildSSECall(sseDone())
    );

    const { result } = renderHook(() => useStreamingReview());

    await act(async () => {
      await result.current.startStream({ repoUrl: 'https://github.com/test/repo' });
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/api/review/stream');
    expect(options.method).toBe('POST');
    expect(options.headers['Content-Type']).toBe('application/json');
  });

  it('accumulates reviewText from multiple SSE data chunks', async () => {
    mockFetch.mockResolvedValue(
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
    mockFetch.mockResolvedValue(
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
    mockFetch.mockResolvedValue(
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
    mockFetch.mockResolvedValueOnce(
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
    mockFetch.mockResolvedValueOnce(
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
    mockFetch.mockResolvedValue(buildSSECall(sseChunk('streaming content') + sseDone()));

    const { result } = renderHook(() => useStreamingReview());

    await act(async () => {
      await result.current.startStream({ repoUrl: 'https://github.com/test/repo' });
    });

    await waitFor(() => {
      expect(result.current.reviewText).toBe('streaming content');
    });
    expect(result.current.isStreaming).toBe(false);
  });

  it('calls sessionStorage for API key in headers', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('test-api-key-123');
    mockFetch.mockResolvedValue(buildSSECall(sseDone()));

    const { result } = renderHook(() => useStreamingReview());

    await act(async () => {
      await result.current.startStream({ repoUrl: 'https://github.com/test/repo' });
    });

    const options = mockFetch.mock.calls[0][1];
    expect(options.headers['x-api-key']).toBe('test-api-key-123');
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
});
