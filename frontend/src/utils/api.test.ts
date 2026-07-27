import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionResponse = () =>
  new Response(JSON.stringify({ csrfToken: "csrf-test" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("apiFetch abort behavior", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    document.cookie = "csrf-token=csrf-test";
  });

  it("passes caller aborts through to the underlying fetch", async () => {
    const callerController = new AbortController();
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url.endsWith("/api/session")) return Promise.resolve(sessionResponse());
      return new Promise<Response>((_, reject) => {
        options?.signal?.addEventListener("abort", () => {
          reject(new DOMException("caller aborted", "AbortError"));
        });
        callerController.abort();
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { apiFetch } = await import("./api");

    await expect(apiFetch("/api/review-history", { signal: callerController.signal })).rejects.toThrow(
      /caller aborted|aborted/i
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("still reports timeout aborts with the timeout message", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      if (url.endsWith("/api/session")) return Promise.resolve(sessionResponse());
      return new Promise<Response>((_, reject) => {
        options?.signal?.addEventListener("abort", () => {
          reject(new DOMException("timeout", "AbortError"));
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { apiFetch } = await import("./api");
    const request = expect(apiFetch("/api/review-history", {}, 10)).rejects.toThrow(
      "Request timed out after 0.01 seconds"
    );
    await vi.advanceTimersByTimeAsync(10);

    await request;
    vi.useRealTimers();
  });
});
