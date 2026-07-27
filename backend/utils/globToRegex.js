import picomatch from 'picomatch';

export function globToRegex(pattern) {
  try {
    return picomatch.makeRe(pattern);
  } catch (err) {
    console.warn(`[globToRegex] Failed to parse pattern: ${pattern}. Falling back to default regex.`, err.message);
    return new RegExp(`^${pattern.replace(/[\\^$+?.()|[\]{}]/g, '\\$&').replace(/\*/g, '.*')}$`);
  }
}
