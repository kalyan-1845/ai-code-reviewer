const SECRET_DETECTION_RULES = [
  // AWS Access Key ID
  /\b((?:AKIA|A3T|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[0-9A-Z]{16})\b/g,

  // AWS Secret Access Key (lookaround for 40 char base64-like strings, excluding pure 40-hex commit SHAs)
  /(?<![A-Za-z0-9/+=])(?![0-9a-fA-F]{40}\b)[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g,

  // GitHub Personal Access Token (PAT)
  /\b(gh[pousr]_[a-zA-Z0-9]{36})\b/g,

  // JSON Web Token (JWT format: header.payload.signature)
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,

  // Generic High-Entropy API Keys / Tokens in assignments
  /(?:api[_\-]?key|secret[_\-]?key|auth[_\-]?token|access[_\-]?token)['"]?\s*[:=]\s*['"]?([a-zA-Z0-9\-_]{20,})['"]?/gi,

  // Generic Bearer Authorization Tokens (require Authorization header context)
  /(?:Authorization|authorization|auth)\s*:\s*Bearer\s+([a-zA-Z0-9\-_.=~+]{20,})\b/gi
];

function hasSecretContext(line) {
  return /(?:AWS|Secret|secret|aws|access\s*key|private\s*key)/.test(line);
}

/**
 * Iterates through regex rules to scrub sensitive credentials from the repository payload.
 * @param {string} codebaseString - The aggregated raw source code to be sanitized.
 * @returns {string} The sanitized payload ready for LLM ingestion.
 */
function scrubRepositoryPayload(codebaseString) {
  if (typeof codebaseString !== 'string') {
    return codebaseString;
  }

  let sanitizedPayload = codebaseString;

  for (const rule of SECRET_DETECTION_RULES) {
    // Replace against a snapshot of the pre-replacement string so the line
    // context lookup below never sees text already modified by this rule's
    // earlier matches (or by previous rules).
    const source = sanitizedPayload;
    sanitizedPayload = source.replace(rule, (match, capturedGroup) => {
      if (capturedGroup) {
        return match.replace(capturedGroup, '[REDACTED_SECRET]');
      }
      // Context check: only redact 40-char base64 strings on lines with secret keywords
      if (!capturedGroup && match.length === 40 && /^[A-Za-z0-9\/+=]{40}$/.test(match)) {
        const lineMatch = source.match(new RegExp('^.*' + match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '.*$', 'm'));
        const line = lineMatch ? lineMatch[0] : '';
        if (!hasSecretContext(line)) {
          return match;
        }
      }
      return '[REDACTED_SECRET]';
    });
  }

  return sanitizedPayload;
}

export { scrubRepositoryPayload };
