// Session owner tokens authorize privileged session operations (issue creation,
// audit continuation) against the backend. They must never be persisted to
// localStorage: any injected script or XSS payload can read localStorage and
// exfiltrate the token, and the value would survive long after the session
// should have ended. Keeping it in memory only means the token is cleared when
// the page is closed and cannot be read from disk.
//
// The backend extends the session's absoluteExpiry to 24 hours on every
// privileged access.  The frontend now defers TTL enforcement entirely to the
// backend: the token is invalidated only when it is explicitly cleared, or when
// the backend returns a 401 (at which point the caller must call
// clearSessionOwnerToken).  This eliminates the window where a valid backend
// session becomes inaccessible because the in-memory copy expired.
let sessionOwnerToken: string = "";

export function getSessionOwnerToken(): string {
  return sessionOwnerToken;
}

export function setSessionOwnerToken(token: string): void {
  sessionOwnerToken = token;
}

export function clearSessionOwnerToken(): void {
  sessionOwnerToken = "";
}
