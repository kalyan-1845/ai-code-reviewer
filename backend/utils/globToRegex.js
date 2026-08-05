export function globToRegex(pattern) {
  if (!pattern || typeof pattern !== 'string') return /^$/;
  let regexStr = '^';
  let i = 0;
  const escapeRegex = (ch) => ch.replace(/[\\^$+?.()|[\]{}]/g, '\\$&');
import picomatch from 'picomatch';

export function globToRegex(pattern) {
  try {
    return picomatch.makeRe(pattern);
  } catch (err) {
    console.warn(`[globToRegex] Failed to parse pattern: ${pattern}. Falling back to default regex.`, err.message);
    return new RegExp(`^${pattern.replace(/\?/g, '[^/]').replace(/\*/g, '[^/]*').replace(/[\\^$+?().|[\]{}]/g, '\\$&')}$`);
  }
}
