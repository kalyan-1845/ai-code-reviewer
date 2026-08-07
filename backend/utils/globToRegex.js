export function globToRegex(pattern) {
  if (typeof pattern !== 'string') {
    throw new TypeError('globToRegex expects a string pattern');
  }

  let out = '^';

  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];

    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') {
          out += '(?:.*/)?';
          i += 2;
        } else {
          out += '.*';
          i += 1;
        }
        continue;
      }
      out += '[^/]*';
      continue;
    }

    if (ch === '?') {
      out += '[^/]';
      continue;
    }

    if ('\\^$.+()[]{}|'.includes(ch)) {
      out += `\\${ch}`;
    } else {
      out += ch;
    }
  }

  out += '$';

  try {
    return new RegExp(out);
  } catch (err) {
    console.warn(`[globToRegex] Failed to compile pattern: ${pattern}. Falling back to default regex.`, err.message);
    return /^$/;
  }
}