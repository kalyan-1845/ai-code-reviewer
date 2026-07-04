/**
 * Unit tests for useDebounce React hook.
 * Uses vitest with jsdom environment (already configured in vitest.config.js).
 * Tests the hook by rendering a test component that displays the debounced value.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';
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
    render(<DebounceDisplay value="initial" delay={500} />);
    expect(screen.getByTestId('debounced-value').textContent).toBe('initial');
  });

  it('keeps initial value before the delay elapses', () => {
    render(<DebounceDisplay value="search query" delay={300} />);
    expect(screen.getByTestId('debounced-value').textContent).toBe('search query');

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.getByTestId('debounced-value').textContent).toBe('search query');
  });

  it('renders the debounced value after the delay elapses', () => {
    render(<DebounceDisplay value="search query" delay={300} />);

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByTestId('debounced-value').textContent).toBe('search query');
  });

  it('cancels the previous timer when value changes before delay fires', () => {
    const { rerender } = render(<DebounceDisplay value="query1" delay={300} />);
    expect(screen.getByTestId('debounced-value').textContent).toBe('query1');

    // Change value before timer fires
    rerender(<DebounceDisplay value="query2" delay={300} />);

    // Advance only 200ms (less than original delay)
    act(() => {
      vi.advanceTimersByTime(200);
    });
    // Still shows query1 because timer hasn't fired yet
    expect(screen.getByTestId('debounced-value').textContent).toBe('query1');

    // Advance remaining time
    act(() => {
      vi.advanceTimersByTime(100);
    });
    // Now shows query2
    expect(screen.getByTestId('debounced-value').textContent).toBe('query2');
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
    render(<DebounceDisplay value={null as any} delay={200} />);
    expect(screen.getByTestId('debounced-value').textContent).toBe('');
  });

  it('handles undefined input', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<DebounceDisplay value={undefined as any} delay={200} />);
    expect(screen.getByTestId('debounced-value').textContent).toBe('');
  });

  it('debounces with a very short delay', () => {
    render(<DebounceDisplay value="short" delay={10} />);

    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(screen.getByTestId('debounced-value').textContent).toBe('short');
  });

  it('debounces with a long delay', () => {
    render(<DebounceDisplay value="long wait" delay={2000} />);

    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(screen.getByTestId('debounced-value').textContent).toBe('long wait');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByTestId('debounced-value').textContent).toBe('long wait');
  });
});
