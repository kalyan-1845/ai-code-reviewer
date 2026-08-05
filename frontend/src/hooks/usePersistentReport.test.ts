/**
 * Unit tests for usePersistentReport React hook.
 * Uses vitest with jsdom environment (configured in vitest.config.js).
 * Tests localforage persistence, hydration, cache expiry, and clear logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePersistentReport } from './usePersistentReport';

// ---------------------------------------------------------------------------
// Mock localforage
// ---------------------------------------------------------------------------
const mockGetItem = vi.fn();
const mockSetItem = vi.fn();
const mockRemoveItem = vi.fn();

vi.mock('localforage', () => ({
  default: {
    getItem: mockGetItem,
    setItem: mockSetItem,
    removeItem: mockRemoveItem,
  },
}));

// ---------------------------------------------------------------------------
// Mock useStore (required by the hook)
// ---------------------------------------------------------------------------
const mockSetAnalysisResult = vi.fn();

vi.mock('../store/useStore', () => ({
  useStore: () => ({
    analysisResult: null,
    setAnalysisResult: mockSetAnalysisResult,
  }),
}));

// ---------------------------------------------------------------------------
// Helper to build a cache entry
// ---------------------------------------------------------------------------
function makeCache(data: object, repoUrl = 'https://github.com/test/repo', sessionId = 'sess-123') {
  return {
    data,
    repoUrl,
    sessionId,
    timestamp: Date.now(),
  };
}

describe('usePersistentReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets isHydrating immediately on mount', async () => {
    mockGetItem.mockResolvedValue(null);
    const { result } = renderHook(() =>
      usePersistentReport(vi.fn(), vi.fn())
    );
    expect(result.current.isHydrating).toBe(true);
  });

  it('loads valid cache within 24h and calls setReport', async () => {
    const cachedData = { findings: [], summary: 'test' };
    mockGetItem.mockResolvedValue(makeCache(cachedData));

    const setRepoUrl = vi.fn();
    const setSessionId = vi.fn();

    renderHook(() => usePersistentReport(setRepoUrl, setSessionId));

    // Advance timers so the async hydrate completes
    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    expect(mockSetAnalysisResult).toHaveBeenCalledWith(cachedData);
    expect(setRepoUrl).toHaveBeenCalledWith('https://github.com/test/repo');
    expect(setSessionId).toHaveBeenCalledWith('sess-123');
  });

  it('clears expired cache older than 24h and does not restore data', async () => {
    const oldCache = {
      data: { findings: [] },
      repoUrl: 'https://github.com/old/repo',
      sessionId: 'old-sess',
      timestamp: Date.now() - 25 * 60 * 60 * 1000, // 25 hours ago
    };
    mockGetItem.mockResolvedValue(oldCache);

    renderHook(() => usePersistentReport(vi.fn(), vi.fn()));

    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    expect(mockRemoveItem).toHaveBeenCalled();
    expect(mockSetAnalysisResult).not.toHaveBeenCalled();
  });

  it('sets isHydrating to false after hydration completes', async () => {
    mockGetItem.mockResolvedValue(null);

    const { result } = renderHook(() =>
      usePersistentReport(vi.fn(), vi.fn())
    );

    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    expect(result.current.isHydrating).toBe(false);
  });

  it('saveReport calls localforage setItem with correct payload', async () => {
    mockGetItem.mockResolvedValue(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = { success: true, repoName: 'test', filesReviewedCount: 1, analysis: {} } as any;
    const repoUrl = 'https://github.com/test/repo';
    const sessionId = 'sess-456';

    const { result } = renderHook(() =>
      usePersistentReport(vi.fn(), vi.fn())
    );

    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    await act(async () => {
      await result.current.saveReport(data, repoUrl, sessionId);
    });

    expect(mockSetItem).toHaveBeenCalledTimes(1);
    const saved = mockSetItem.mock.calls[0][1];
    expect(saved.data).toEqual(data);
    expect(saved.repoUrl).toEqual(repoUrl);
    expect(saved.sessionId).toEqual(sessionId);
    expect(typeof saved.timestamp).toBe('number');
  });

  it('clearReport calls localforage removeItem and resets state', async () => {
    mockGetItem.mockResolvedValue(null);
    const setRepoUrl = vi.fn();
    const setSessionId = vi.fn();

    const { result } = renderHook(() =>
      usePersistentReport(setRepoUrl, setSessionId)
    );

    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    await act(async () => {
      await result.current.clearReport();
    });

    expect(mockRemoveItem).toHaveBeenCalled();
    expect(setRepoUrl).toHaveBeenCalledWith('');
    expect(setSessionId).toHaveBeenCalledWith(null);
  });

  it('handles getItem throwing without crashing', async () => {
    mockGetItem.mockRejectedValue(new Error('storage error'));

    const { result } = renderHook(() =>
      usePersistentReport(vi.fn(), vi.fn())
    );

    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    // Should not throw, isHydrating should become false
    expect(result.current.isHydrating).toBe(false);
  });
});
