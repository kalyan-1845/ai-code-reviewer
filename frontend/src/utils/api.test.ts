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

describe("API key is kept in memory only (regression #3675)", () => {
  const unauthorizedResponse = () => new Response("Unauthorized", { status: 401 });

  const setupFetch = (loginHeaderCaptures: Record<string, string | undefined>[]) => {
    const fetchMock = vi.fn((url: string, options?: RequestInit) => {
      const headers = (options?.headers as Record<string, string>) || {};
      if (url.endsWith("/api/session") && !headers["x-api-key"]) {
        return Promise.resolve(unauthorizedResponse());
      }
      if (url.endsWith("/api/session")) {
        loginHeaderCaptures.push(headers);
        return Promise.resolve(sessionResponse());
      }
      return Promise.resolve(sessionResponse());
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  const submitApiKey = async (value: string) => {
    const deadline = Date.now() + 2000;
    let input: HTMLInputElement | null = null;
    while (Date.now() < deadline) {
      input = document.querySelector('input[type="password"]');
      if (input) break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    if (!input) throw new Error("Password dialog did not appear");
    input.value = value;
    const submit = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent === "Submit"
    ) as HTMLButtonElement;
    submit.click();
  };

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    document.cookie = "";
    document.body.innerHTML = "";
    sessionStorage.clear();
  });

  it("does not write the API key to sessionStorage after a key-based login", async () => {
    const captured: Record<string, string | undefined>[] = [];
    setupFetch(captured);

    const { apiFetch } = await import("./api");
    const pending = apiFetch("/api/review-history");
    await submitApiKey("secret-backend-key");
    await pending;

    expect(sessionStorage.getItem("reposage_api_key")).toBeNull();
    expect(captured[0]?.["x-api-key"]).toBe("secret-backend-key");
  });

  it("keeps the API key in memory for the page lifetime", async () => {
    const captured: Record<string, string | undefined>[] = [];
    setupFetch(captured);

    const { apiFetch, getApiKey } = await import("./api");
    const pending = apiFetch("/api/review-history");
    await submitApiKey("in-memory-key");
    await pending;

    expect(getApiKey()).toBe("in-memory-key");
  });

  it("clears the in-memory key on clearApiKey", async () => {
    const captured: Record<string, string | undefined>[] = [];
    setupFetch(captured);

    const { apiFetch, getApiKey, clearApiKey } = await import("./api");
    const pending = apiFetch("/api/review-history");
    await submitApiKey("clear-me-key");
    await pending;
    expect(getApiKey()).toBe("clear-me-key");

    clearApiKey();
    expect(getApiKey()).toBeNull();
  });
});
