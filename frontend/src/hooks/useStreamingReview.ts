import { useState, useCallback, useRef } from 'react';
import { getApiKey, ensureApiSession, getCsrfToken } from '../utils/api';

// Backend base URL is provided at runtime by config.js (__RUNTIME_API_URL__) or
// at build time via VITE_API_URL. Same-origin default; no hardcoded dev URL.
const API_BASE_URL = (typeof __RUNTIME_API_URL__ !== 'undefined' ? __RUNTIME_API_URL__ : import.meta.env.VITE_API_URL) || '';

export const useStreamingReview = () => {
  const [reviewText, setReviewText] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isMock, setIsMock] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const startStream = useCallback(async (payload: Record<string, unknown> | RequestInit) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setReviewText('');
    setIsStreaming(true);
    setError(null);
    setIsMock(false);

    try {
      // The streaming endpoint is covered by the global CSRF middleware.
      // Ensure the session (cookie + CSRF token) exists and send the token so
      // POST /api/review/stream does not fail with 403 for cookie-authenticated
      // sessions.
      await ensureApiSession();
      const csrfToken = getCsrfToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-api-key': getApiKey() || '',
      };
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }
      const isRequestInit = 'method' in payload || 'body' in payload;
      const response = await fetch(`${API_BASE_URL}/api/review/stream`, {
        method: 'POST',
        credentials: 'include',
        headers,
        signal: controller.signal,
        body: isRequestInit ? (payload as RequestInit).body : JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('ReadableStream is not supported by your browser.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let done = false;
      let buffer = '';

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;

        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          
          buffer = parts.pop() || '';

          for (const part of parts) {
            if (part.startsWith('data: ')) {
              const dataStr = part.replace(/^data:\s*/, '').trim();
              
              if (dataStr === '[DONE]') {
                done = true;
                break;
              }

              try {
                const parsed = JSON.parse(dataStr);
                if (parsed._mock === true) {
                  setIsMock(true);
                }
                if (parsed.text) {
                  setReviewText((prev) => prev + parsed.text);
                } else if (parsed.error) {
                  setError(parsed.error);
                  done = true;
                  break;
                }
              } catch (e) {
                console.error('Failed to parse SSE chunk JSON:', e);
              }
            }
          }
        }
      }
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') {
        return;
      }
      setError(err instanceof Error ? err.message : 'An error occurred while streaming.');
    } finally {
      if (abortRef.current === controller) {
        setIsStreaming(false);
      }
    }
  }, []);

  const resetStream = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setReviewText('');
    setIsStreaming(false);
    setIsMock(false);
    setError(null);
  }, []);

  return { reviewText, isStreaming, isMock, error, startStream, resetStream };
};
