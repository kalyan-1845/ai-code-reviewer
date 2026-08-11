import picomatch from 'picomatch';

export function globToRegex(pattern) {
  if (typeof pattern !== 'string') {
    console.warn(`[globToRegex] Invalid pattern (expected string, got ${typeof pattern}). Returning never-match regex.`);
    return /(?!)/;
  }
  try {
    return picomatch.makeRe(pattern);
  } catch (err) {
    console.warn(`[globToRegex] Failed to parse pattern: ${pattern}. Falling back to default regex.`, err.message);
    return new RegExp(`^${pattern.replace(/\?/g, '[^/]').replace(/\*/g, '[^/]*').replace(/[\\^$+?().|[\]{}]/g, '\\$&')}$`);
  }
}
