const GITHUB_URL_PATTERN = /^https:\/\/github\.com\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+(\.git)?(\/)?$/;

export function isValidRepoUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return GITHUB_URL_PATTERN.test(url);
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
