import { Router } from 'express';
import { requireApiKey, createFrontendSessionCookie, SESSION_COOKIE_NAME } from '../utils/authMiddleware.js';
import { generateCsrfToken, csrfTokenStore, csrfGraceTokenStore, CSRF_COOKIE_NAME } from './context.js';

const router = Router();

router.post('/api/session', requireApiKey, (req, res) => {
  const sessionCookie = createFrontendSessionCookie(res);
  if (!sessionCookie) return;

  const csrfToken = generateCsrfToken();
  res.cookie(CSRF_COOKIE_NAME, csrfToken, {
    sameSite: 'strict',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  });
  return res.json({ success: true, csrfToken });
});

router.post('/api/logout', requireApiKey, (req, res) => {
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  if (cookieToken) {
    csrfTokenStore.delete(cookieToken);
    csrfGraceTokenStore.delete(cookieToken);
  }
  res.clearCookie(CSRF_COOKIE_NAME, { path: '/' });
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  return res.json({ success: true, message: 'Logged out successfully.' });
});

router.get('/api/csrf-token', (req, res) => {
  const csrfToken = generateCsrfToken();
  res.cookie(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  });
  res.json({ csrfToken });
});

export default router;
