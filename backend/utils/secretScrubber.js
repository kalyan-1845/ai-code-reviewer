const SECRET_DETECTION_RULES = [
  // AWS Access Key ID
  /\b((?:AKIA|A3T|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[0-9A-Z]{16})\b/g,

  // AWS Secret Access Key (lookaround for 40 char base64-like strings)
  /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g,

  // GitHub Personal Access Token (PAT)
  /\b(gh[pousr]_[a-zA-Z0-9]{36})\b/g,

  // JSON Web Token (JWT format: header.payload.signature)
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,

  // Generic High-Entropy API Keys / Tokens in assignments
  /(?:api[_\-]?key|secret[_\-]?key|auth[_\-]?token|access[_\-]?token)['"]?\s*[:=]\s*['"]?([a-zA-Z0-9\-_]{20,})['"]?/gi,

  // Generic Bearer Authorization Tokens
  /\bBearer\s+([a-zA-Z0-9\-_.=~+]{20,})\b/gi
];

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
    sanitizedPayload = sanitizedPayload.replace(rule, (match, capturedGroup) => {
      if (capturedGroup && match.includes(capturedGroup)) {
        return match.replace(capturedGroup, '[REDACTED_SECRET]');
      }
      return '[REDACTED_SECRET]';
    });
  }

  return sanitizedPayload;
}

export { scrubRepositoryPayload };
