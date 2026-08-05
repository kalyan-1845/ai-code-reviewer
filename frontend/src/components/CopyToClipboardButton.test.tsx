/**
 * Unit tests for CopyToClipboardButton component.
 * Uses vitest with jsdom environment (configured in vitest.config.js).
 * Tests clipboard copy, visual feedback, and props.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import CopyToClipboardButton from './CopyToClipboardButton';

// ---------------------------------------------------------------------------
// Mock navigator.clipboard
// ---------------------------------------------------------------------------
const mockWriteText = vi.fn().mockResolvedValue(undefined);
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: mockWriteText },
  configurable: true,
});

// ---------------------------------------------------------------------------
// Mock lucide-react icons
// ---------------------------------------------------------------------------
vi.mock('lucide-react', () => ({
  Check: () => <span data-testid="check-icon" />,
  Copy: () => <span data-testid="copy-icon" />,
}));

describe('CopyToClipboardButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders a button element', () => {
    render(<CopyToClipboardButton textToCopy="hello" />);
    expect(screen.getByRole('button')).toBeTruthy();
  });

  it('calls clipboard.writeText with the correct text on click', async () => {
    render(<CopyToClipboardButton textToCopy="https://example.com" />);

    await act(async () => {
      screen.getByRole('button').click();
    });

    expect(mockWriteText).toHaveBeenCalledTimes(1);
    expect(mockWriteText).toHaveBeenCalledWith('https://example.com');
  });

  it('shows check icon after successful copy', async () => {
    render(<CopyToClipboardButton textToCopy="some text" />);

    await act(async () => {
      screen.getByRole('button').click();
    });

    expect(screen.queryByTestId('check-icon')).toBeTruthy();
  });

  it('shows copy icon before clicking', () => {
    render(<CopyToClipboardButton textToCopy="some text" />);
    expect(screen.queryByTestId('copy-icon')).toBeTruthy();
  });

  it('resets to copy icon after 2 seconds', async () => {
    render(<CopyToClipboardButton textToCopy="text" />);

    await act(async () => {
      screen.getByRole('button').click();
    });

    expect(screen.queryByTestId('check-icon')).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByTestId('check-icon')).not.toBeTruthy();
    expect(screen.queryByTestId('copy-icon')).toBeTruthy();
  });

  it('renders with showText prop displaying label', () => {
    render(<CopyToClipboardButton textToCopy="text" showText={true} />);
    expect(screen.getByText('Copy')).toBeTruthy();
  });

  it('displays Copied label after click when showText is true', async () => {
    render(<CopyToClipboardButton textToCopy="text" showText={true} />);

    await act(async () => {
      screen.getByRole('button').click();
    });

    expect(screen.getByText('Copied!')).toBeTruthy();
  });

  it('clears previous timeout when clicked again', async () => {
    render(<CopyToClipboardButton textToCopy="text" showText={true} />);

    // First click
    await act(async () => {
      screen.getByRole('button').click();
    });
    expect(screen.getByText('Copied!')).toBeTruthy();

    // Advance halfway through the 2s timeout
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    // Second click - resets the timer
    await act(async () => {
      screen.getByRole('button').click();
    });

    // Still shows Copied!
    expect(screen.getByText('Copied!')).toBeTruthy();

    // Only 1s has passed, should still be showing Copied!
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText('Copied!')).toBeTruthy();

    // After full 2s from second click (1.5s total), still Copied!
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText('Copied!')).not.toBeTruthy();
  });

  it('cleans up timeout on unmount without throwing', () => {
    const { unmount } = render(<CopyToClipboardButton textToCopy="text" />);

    expect(() => {
      unmount();
      act(() => {
        vi.advanceTimersByTime(2000);
      });
    }).not.toThrow();
  });
});
