export const API_ROUTES = {
  SESSION: '/api/session',
  CSRF_TOKEN: '/api/csrf-token',
  REVIEW_HISTORY: '/api/review-history',
  FIX_SUGGESTIONS: (findingId: string) => `/api/fix-suggestions/${findingId}`,
  CREATE_ISSUE: '/api/issues/create',
  CHAT: '/api/chat',
  ANALYZE: '/api/analyze',
  ANALYTICS_TRENDS: '/api/analytics/trends',
  HTML_REPORT: '/api/reports/html',
} as const;
