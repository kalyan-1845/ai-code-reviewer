/**
 * Unit tests for sessionToken utility.
 * Tests localStorage-based session token get/set with expiry.
 */
import { describe, it, expect, beforeEach } from 'vitest';

// Mock localStorage
const store: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); },
};

Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage });

import { getSessionOwnerToken, setSessionOwnerToken } from './sessionToken';

describe('sessionToken', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  it('getSessionOwnerToken returns empty string when no token is stored', () => {
    const result = getSessionOwnerToken();
    expect(result).toBe('');
  });

  it('getSessionOwnerToken returns token when stored and not expired', () => {
    mockLocalStorage.setItem('sessionOwnerToken', 'test-token-abc123');
    mockLocalStorage.setItem('sessionOwnerTokenExpiry', String(Date.now() + 60000));
    const result = getSessionOwnerToken();
    expect(result).toBe('test-token-abc123');
  });

  it('getSessionOwnerToken removes token when expired', () => {
    mockLocalStorage.setItem('sessionOwnerToken', 'expired-token');
    mockLocalStorage.setItem('sessionOwnerTokenExpiry', String(Date.now() - 1000));
    const result = getSessionOwnerToken();
    expect(result).toBe('');
    expect(mockLocalStorage.getItem('sessionOwnerToken')).toBeNull();
  });

  it('getSessionOwnerToken removes token when expiry is not a finite number', () => {
    mockLocalStorage.setItem('sessionOwnerToken', 'some-token');
    mockLocalStorage.setItem('sessionOwnerTokenExpiry', 'not-a-number');
    const result = getSessionOwnerToken();
    expect(result).toBe('');
  });

  it('setSessionOwnerToken stores token and expiry in localStorage', () => {
    setSessionOwnerToken('my-secret-token');
    expect(mockLocalStorage.getItem('sessionOwnerToken')).toBe('my-secret-token');
    const expiry = Number(mockLocalStorage.getItem('sessionOwnerTokenExpiry'));
    expect(expiry).toBeGreaterThan(Date.now());
  });
});
