import { useState, useCallback } from 'react';

const API_BASE_URL = (typeof __RUNTIME_API_URL__ !== 'undefined' ? __RUNTIME_API_URL__ : import.meta.env.VITE_API_URL) || 'http://localhost:5000';

export const useStreamingReview = () => {
  const [reviewText, setReviewText] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const startStream = useCallback(async (payload: Record<string, unknown> | RequestInit) => {
    setReviewText('');
    setIsStreaming(true);
    setError(null);

    try {
      const isRequestInit = 'method' in payload || 'body' in payload;
      const response = await fetch(`${API_BASE_URL}/api/review/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': sessionStorage.getItem('reposage_api_key') || '',
        },
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
      setError(err instanceof Error ? err.message : 'An error occurred while streaming.');
    } finally {
      setIsStreaming(false);
    }
  }, []);

  return { reviewText, isStreaming, error, startStream };
};
