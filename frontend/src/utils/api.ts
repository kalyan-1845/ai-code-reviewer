const API_BASE_URL = (window as any).__RUNTIME_API_URL__ || import.meta.env.VITE_API_URL || "http://localhost:5000";
const API_KEY_STORAGE_KEY = "reposage_api_key";
let sessionRequest: Promise<void> | null = null;
let csrfToken: string | null = null;

function showPasswordDialog(): Promise<string> {
  return new Promise((resolve, reject) => {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:99999";

    const dialog = document.createElement("div");
    dialog.style.cssText = "background:#fff;padding:24px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);min-width:360px;font-family:sans-serif";

    const heading = document.createElement("h3");
    heading.textContent = "API Key Required";
    heading.style.cssText = "margin:0 0 8px 0;color:#333;font-size:16px";

    const desc = document.createElement("p");
    desc.textContent = "Enter the RepoSage backend API key:";
    desc.style.cssText = "margin:0 0 16px 0;color:#666;font-size:13px";

    const input = document.createElement("input");
    input.type = "password";
    input.style.cssText = "width:100%;padding:10px;border:1px solid #ddd;border-radius:4px;font-size:14px;box-sizing:border-box";
    input.autofocus = true;

    const buttonRow = document.createElement("div");
    buttonRow.style.cssText = "display:flex;gap:8px;justify-content:flex-end;margin-top:16px";

    const submitBtn = document.createElement("button");
    submitBtn.textContent = "Submit";
    submitBtn.style.cssText = "padding:8px 20px;background:#a855f7;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:14px";

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.cssText = "padding:8px 20px;background:#f5f5f5;color:#333;border:1px solid #ddd;border-radius:4px;cursor:pointer;font-size:14px";

    buttonRow.appendChild(cancelBtn);
    buttonRow.appendChild(submitBtn);

    dialog.appendChild(heading);
    dialog.appendChild(desc);
    dialog.appendChild(input);
    dialog.appendChild(buttonRow);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    function cleanup() {
      document.body.removeChild(overlay);
    }

    submitBtn.onclick = () => {
      const val = input.value.trim();
      if (!val) {
        input.focus();
        input.style.borderColor = "#e53e3e";
        return;
      }
      cleanup();
      resolve(val);
    };

    cancelBtn.onclick = () => {
      cleanup();
      reject(new Error("Backend API key is required to continue."));
    };

    input.onkeydown = (e) => {
      if (e.key === "Enter") submitBtn.click();
      if (e.key === "Escape") cancelBtn.click();
    };

    setTimeout(() => input.focus(), 100);
  });
}

const ensureApiSession = async () => {
  if (!sessionRequest) {
    sessionRequest = fetch(`${API_BASE_URL}/api/session`, {
      method: "POST",
      credentials: "include",
    }).then(async (response) => {
      if (response.status === 401) {
        let apiKey = sessionStorage.getItem(API_KEY_STORAGE_KEY);

        if (!apiKey) {
          apiKey = await showPasswordDialog();
          sessionStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
        }

        const loginResponse = await fetch(`${API_BASE_URL}/api/session`, {
          method: "POST",
          credentials: "include",
          headers: {
            "x-api-key": apiKey,
          },
        });

        if (!loginResponse.ok) {
          sessionStorage.removeItem(API_KEY_STORAGE_KEY);
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

export const clearApiKey = () => {
  sessionStorage.removeItem(API_KEY_STORAGE_KEY);
  sessionRequest = null;
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

