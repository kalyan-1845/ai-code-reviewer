export function globToRegex(pattern) {
  if (!pattern) return /^$/;

  let regexStr = '^';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];

    if (c === '*' && pattern[i + 1] === '*' && pattern[i + 2] === '/') {
      regexStr += '(?:.*/)?';
      i += 2;
    } else if (c === '*' && pattern[i + 1] === '*') {
      regexStr += '.*';
      i++;
    } else if (c === '*') {
      regexStr += '[^/]*';
    } else if (c === '?') {
      regexStr += '[^/]';
    } else if (c === '\\') {
      if (i + 1 < pattern.length) {
        i++;
        const nextChar = pattern[i];
        if (/[a-zA-Z0-9]/.test(nextChar)) {
          regexStr += nextChar;
        } else {
          regexStr += '\\' + nextChar;
        }
      } else {
        regexStr += '\\\\';
      }
    } else if (/[.+^$()[\]{}|\\]/.test(c)) {
      regexStr += '\\' + c;
    } else {
      regexStr += c;
    }
  }
  regexStr += '$';
  return new RegExp(regexStr);
}
