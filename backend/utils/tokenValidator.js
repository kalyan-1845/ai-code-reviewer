export function isValidGithubToken(token) {
  if (!token || typeof token !== 'string') return false;
  // Modern GitHub token formats: ghp_ (classic PAT), gho_ (org PAT),
  // ghu_ (OAuth), ghs_ (server/app), ghr_ (refresh), github_pat_ (fine-grained).
  const tokenRegex = /^(ghp_|gho_|ghu_|ghs_|ghr_|github_pat_)[a-zA-Z0-9_]+$/;
  return tokenRegex.test(token);
}
