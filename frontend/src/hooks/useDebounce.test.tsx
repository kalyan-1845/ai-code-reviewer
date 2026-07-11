/**
 * Unit tests for useDebounce React hook.
 * Uses vitest with jsdom environment (already configured in vitest.config.js).
 * Tests the hook by rendering a test component that displays the debounced value.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useDebounce } from './useDebounce';

// Test component that renders the debounced value in a data-testid span
function DebounceDisplay({ value, delay }: { value: string; delay: number }) {
  const debouncedValue = useDebounce(value, delay);
  return <span data-testid="debounced-value">{debouncedValue}</span>;
}

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the initial value immediately', () => {
    const { getByTestId } = render(<DebounceDisplay value="initial" delay={500} />);
    expect(getByTestId('debounced-value').textContent).toBe('initial');
  });

  it('keeps initial value before the delay elapses', () => {
    const { getByTestId } = render(<DebounceDisplay value="search query" delay={300} />);
    expect(getByTestId('debounced-value').textContent).toBe('search query');

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(getByTestId('debounced-value').textContent).toBe('search query');
  });

  it('renders the debounced value after the delay elapses', () => {
    const { getByTestId } = render(<DebounceDisplay value="search query" delay={300} />);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(getByTestId('debounced-value').textContent).toBe('search query');
  });

  it('cancels the previous timer when value changes before delay fires', () => {
    const { rerender, getByTestId } = render(<DebounceDisplay value="query1" delay={300} />);
    expect(getByTestId('debounced-value').textContent).toBe('query1');

    rerender(<DebounceDisplay value="query2" delay={300} />);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(getByTestId('debounced-value').textContent).toBe('query1');

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(getByTestId('debounced-value').textContent).toBe('query2');
  });

  it('cleans up timer on unmount without throwing', () => {
    const { unmount } = render(<DebounceDisplay value="value" delay={500} />);

    expect(() => {
      unmount();
      act(() => {
        vi.advanceTimersByTime(500);
      });
    }).not.toThrow();
  });

  it('handles null input', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { getByTestId } = render(<DebounceDisplay value={null as any} delay={200} />);
    expect(getByTestId('debounced-value').textContent).toBe('');
  });

  it('handles undefined input', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { getByTestId } = render(<DebounceDisplay value={undefined as any} delay={200} />);
    expect(getByTestId('debounced-value').textContent).toBe('');
  });

  it('debounces with a very short delay', () => {
    const { getByTestId } = render(<DebounceDisplay value="short" delay={10} />);

    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(getByTestId('debounced-value').textContent).toBe('short');
  });

  it('debounces with a long delay', () => {
    const { getByTestId } = render(<DebounceDisplay value="long wait" delay={2000} />);

    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(getByTestId('debounced-value').textContent).toBe('long wait');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(getByTestId('debounced-value').textContent).toBe('long wait');
  });
});
