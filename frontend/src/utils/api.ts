const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
let sessionRequest: Promise<void> | null = null;
let csrfToken: string | null = null;

const ensureApiSession = async () => {
  if (!sessionRequest) {
    sessionRequest = fetch(`${API_BASE_URL}/api/session`, {
      method: "POST",
      credentials: "include",
    }).then(async (response) => {
      if (response.status === 401) {
        const apiKey = window.prompt("Enter the RepoSage backend API key:");
        if (!apiKey) {
          throw new Error("Backend API key is required to continue.");
        }

        const loginResponse = await fetch(`${API_BASE_URL}/api/session`, {
          method: "POST",
          credentials: "include",
          headers: {
            "x-api-key": apiKey,
          },
        });

        if (!loginResponse.ok) {
          throw new Error("Invalid backend API key.");
        }
        const loginData = await loginResponse.json();
        if (loginData.csrfToken) {
          csrfToken = loginData.csrfToken;
        }
        return;
      }

      if (!response.ok) {
        throw new Error("Could not initialize a secure API session.");
      }
      const data = await response.json();
      if (data.csrfToken) {
        csrfToken = data.csrfToken;
      }
    }).catch((error) => {
      sessionRequest = null;
      throw error;
    });
  }

  return sessionRequest;
};

const getCsrfToken = (): string | null => {
  if (csrfToken) return csrfToken;
  const match = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
  return match ? match[1] : null;
};

const refreshCsrfToken = async (): Promise<string | null> => {
  const response = await fetch(`${API_BASE_URL}/api/csrf-token`, {
    credentials: "include",
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => ({}));
  if (data.csrfToken) {
    csrfToken = data.csrfToken;
    return csrfToken;
  }
  const match = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
  csrfToken = match ? match[1] : null;
  return csrfToken;
};

const isCsrfFailure = async (response: Response): Promise<boolean> => {
  if (response.status !== 403) return false;
  const clone = response.clone();
  try {
    const data = await clone.json();
    return typeof data?.error === "string" && data.error.toLowerCase().includes("csrf");
  } catch {
    const text = await response.clone().text().catch(() => "");
    return text.toLowerCase().includes("csrf");
  }
};

export const apiFetch = async (
  path: string,
  options: RequestInit = {},
  timeoutMs = 60000,
  retryOnCsrfFailure = true
): Promise<Response> => {
  await ensureApiSession();
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const method = (options.method || "GET").toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const token = getCsrfToken();
    if (token) {
      headers.set("X-CSRF-Token", token);
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      credentials: "include",
      headers,
      signal: controller.signal,
    });
    // Refresh CSRF token from cookies after each response (handles rotation)
    const match = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
    if (match) {
      csrfToken = match[1];
    }
    if (retryOnCsrfFailure && ["POST", "PUT", "PATCH", "DELETE"].includes(method) && await isCsrfFailure(response)) {
      clearTimeout(timeoutId);
      const refreshedToken = await refreshCsrfToken();
      if (refreshedToken) {
        const retryHeaders = new Headers(options.headers);
        if (!retryHeaders.has("Content-Type")) {
          retryHeaders.set("Content-Type", "application/json");
        }
        retryHeaders.set("X-CSRF-Token", refreshedToken);
        return apiFetch(path, { ...options, headers: retryHeaders }, timeoutMs, false);
      }
    }
    return response;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs / 1000} seconds. Backend might be hanging.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};
export const getReviewHistory = async () => {
  const response = await apiFetch("/api/review-history");
  if (!response.ok) throw new Error("Failed to fetch review history");
  return response.json();
};

