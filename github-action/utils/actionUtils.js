/**
 * Converts a glob-style .gitignore pattern to a RegExp.
 * Supports: * (non-slash wildcard), ** (recursive), ? (single char), . (escaped).
 */
export function globToRegex(pattern) {
  if (pattern.length > 1024) {
    throw new Error(`Glob pattern too long (${pattern.length} chars, max 1024)`);
  }

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
    } else if (ch === '/') {
      regexStr += '/';
      i++;
    } else if ('\\.+*?^${}()|[]'.includes(ch)) {
      regexStr += '\\' + ch;
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
 * Returns the PARSE_FAILED sentinel on parse failure so callers can distinguish
 * a null result from a genuine parse error.
 */
export function cleanAndParseJSON(responseText) {
  try {
    let cleaned = responseText.trim();
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
    }
    return JSON.parse(cleaned);
  } catch {
    return { reviews: [], _parseFailed: true };
  }
}

export function normalizeReviewLineNumber(value) {
  const line = Number(value);
  return Number.isInteger(line) && line > 0 ? line : null;
}

/**
 * Ensures that any markdown code blocks (triple backticks) are properly closed.
 * Prevents unclosed blocks from breaking the GitHub PR UI.
 */
export function sanitizeMarkdownCodeBlocks(commentText) {
  if (typeof commentText !== 'string') return commentText;
  
  const matches = commentText.match(/```/g);
  if (matches && matches.length % 2 !== 0) {
    return commentText.endsWith('\n') ? commentText + '```' : commentText + '\n```';
  }
  return commentText;
}
