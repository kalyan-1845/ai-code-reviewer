import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

describe("sessionToken in-memory storage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("returns a token after it is set", async () => {
    const { setSessionOwnerToken, getSessionOwnerToken } = await import("./sessionToken");
    setSessionOwnerToken("tok-123");
    expect(getSessionOwnerToken()).toBe("tok-123");
  });

  it("never writes the token to localStorage", async () => {
    const { setSessionOwnerToken, getSessionOwnerToken } = await import("./sessionToken");
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    setSessionOwnerToken("tok-secret");
    getSessionOwnerToken();

    expect(getItem).not.toHaveBeenCalledWith(
      "sessionOwnerToken",
      expect.anything(),
    );
    expect(setItem).not.toHaveBeenCalled();
  });

  it("keeps the token after 60 minutes (backend session is 24h)", async () => {
    vi.useFakeTimers();
    const { setSessionOwnerToken, getSessionOwnerToken } = await import("./sessionToken");
    setSessionOwnerToken("tok-long-lived");
    expect(getSessionOwnerToken()).toBe("tok-long-lived");

    // The old 60-minute client TTL used to expire here while the backend
    // session was still alive, permanently 403ing privileged calls.
    vi.advanceTimersByTime(60 * 60 * 1000);
    expect(getSessionOwnerToken()).toBe("tok-long-lived");
  });

  it("drops the token after the TTL window expires", async () => {
    vi.useFakeTimers();
    const { setSessionOwnerToken, getSessionOwnerToken } = await import("./sessionToken");
    setSessionOwnerToken("tok-expiring");
    expect(getSessionOwnerToken()).toBe("tok-expiring");

    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1);
    expect(getSessionOwnerToken()).toBe("");
  });

  it("returns an empty string before any token is set", async () => {
    const { getSessionOwnerToken } = await import("./sessionToken");
    expect(getSessionOwnerToken()).toBe("");
  });
});
