const TOKEN_KEY = "sessionOwnerToken";
const EXPIRY_KEY = "sessionOwnerTokenExpiry";
const TOKEN_TTL_MS = 60 * 60 * 1000;

export function getSessionOwnerToken(): string {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return "";
  const expiry = Number(localStorage.getItem(EXPIRY_KEY) ?? 0);
  if (!Number.isFinite(expiry) || Date.now() >= expiry) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRY_KEY);
    return "";
  }
  return token;
}

export function setSessionOwnerToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EXPIRY_KEY, String(Date.now() + TOKEN_TTL_MS));
}
