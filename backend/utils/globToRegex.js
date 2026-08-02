import picomatch from 'picomatch';

  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === '*') {
      if (i + 1 < pattern.length && pattern[i + 1] === '*') {
        if (i + 2 < pattern.length && pattern[i + 2] === '/') {
          regexStr += '(?:.*/)?';
          i += 3;
        } else {
          regexStr += '.*';
          i += 2;
        }
      } else {
        regexStr += '[^/]*';
        i++;
      }
    } else if (ch === '?') {
      regexStr += '[^/]';
      i++;
    } else if (ch === '/') {
      regexStr += '/';
      i++;
    } else {
      regexStr += escapeRegex(ch);
      i++;
    }
export function globToRegex(pattern) {
  try {
    return picomatch.makeRe(pattern);
  } catch (err) {
    console.warn(`[globToRegex] Failed to parse pattern: ${pattern}. Falling back to default regex.`, err.message);
    // Escape every regex metacharacter FIRST so that characters introduced by
    // the glob conversion below (e.g. the brackets in `[^/]`) are not
    // escaped again and turned into literals.
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*\/+/g, '__GLOBSTAR__')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')
      .replace(/__GLOBSTAR__/g, '(?:.*/)?');
    return new RegExp(`^${escaped}$`);
  }
}
