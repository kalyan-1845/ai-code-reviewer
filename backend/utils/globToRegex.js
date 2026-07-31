import picomatch from 'picomatch';

export function globToRegex(pattern) {
  try {
    return picomatch.makeRe(pattern);
  } catch (err) {
    console.warn(`[globToRegex] Failed to parse pattern: ${pattern}. Falling back to default regex.`, err.message);
    const escaped = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '[^/]')
      .replace(/[\\^$+().|[\]{}]/g, '\\$&');
    return new RegExp(`^${escaped}$`);
  }
}
