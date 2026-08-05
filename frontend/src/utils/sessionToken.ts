// Session owner tokens authorize privileged session operations (issue creation,
// audit continuation) against the backend. They must never be persisted to
// localStorage: any injected script or XSS payload can read localStorage and
// exfiltrate the token, and the value would survive long after the session
// should have ended. Keeping it in memory only means the token is cleared when
// the page is closed and cannot be read from disk.
let sessionOwnerToken: string = "";
let sessionOwnerTokenExpiry: number = 0;
const TOKEN_TTL_MS = 60 * 60 * 1000;

export function getSessionOwnerToken(): string {
  if (!sessionOwnerToken) return "";
  if (!Number.isFinite(sessionOwnerTokenExpiry) || Date.now() >= sessionOwnerTokenExpiry) {
    sessionOwnerToken = "";
    sessionOwnerTokenExpiry = 0;
    return "";
  }
  return sessionOwnerToken;
}

export function setSessionOwnerToken(token: string): void {
  sessionOwnerToken = token;
  sessionOwnerTokenExpiry = Date.now() + TOKEN_TTL_MS;
}
