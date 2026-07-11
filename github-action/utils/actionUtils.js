/**
 * Converts a glob-style .gitignore pattern to a RegExp.
 * Supports: * (non-slash wildcard), ** (recursive), ? (single char), . (escaped).
 */
export function globToRegex(pattern) {
  let regexStr = '^';
  let i = 0;
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
    } else if (ch === '.') {
      regexStr += '\\.';
      i++;
    } else if (ch === '/') {
      regexStr += '/';
      i++;
    } else {
      regexStr += ch;
      i++;
    }
  }
  regexStr += '$';
  return new RegExp(regexStr);
}

/**
 * Safely parses JSON from an LLM response text, stripping markdown code fences.
 * Returns {reviews: []} on parse failure instead of throwing.
 */
export function cleanAndParseJSON(responseText) {
  try {
    let cleaned = responseText.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.substring(7);
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.substring(3);
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
    return JSON.parse(cleaned.trim());
  } catch {
    return { reviews: [] };
  }
}

export function normalizeReviewLineNumber(value) {
  const line = Number(value);
  return Number.isInteger(line) && line > 0 ? line : null;
}
