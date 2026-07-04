const GITHUB_URL_PATTERN = /^https:\/\/github\.com\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+(\.git)?(\/)?$/;

export function isValidRepoUrl(url) {
  if (!url || typeof url !== 'string') return false;

  // Reject URLs containing spaces, tabs, null bytes, or control characters
  if (/[\s\t\x00-\x1f]/.test(url)) return false;

  // Reject URLs that start with or contain flag-like patterns (git argument injection)
  if (/--?[a-zA-Z]/.test(url.replace(/^https:\/\/github\.com\//, ''))) return false;

  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'github.com') return false;
    if (parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    if (parsed.search || parsed.hash) return false;
    if (!GITHUB_URL_PATTERN.test(url)) return false;
    return true;
  } catch {
    return false;
  }
}

export function parseRepoUrl(url) {
  if (!isValidRepoUrl(url)) return null;
  const cleanUrl = url.replace(/\/+$/, '').replace(/\.git$/, '');
  const parts = cleanUrl.split('/');
  return {
    owner: parts[parts.length - 2],
    repo: parts[parts.length - 1]
  };
}
