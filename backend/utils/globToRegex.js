export function globToRegex(pattern) {
  let regexStr = '^';
  let i = 0;
  const escapeRegex = (ch) => ch.replace(/[\\^$+?.()|[\]{}]/g, '\\$&');

  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === '*') {
      if (i + 1 < pattern.length && pattern[i + 1] === '*') {
        regexStr += '.*';
        i += 2;
        if (i < pattern.length && pattern[i] === '/') {
          i++;
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
  }

  regexStr += '$';
  return new RegExp(regexStr);
}
