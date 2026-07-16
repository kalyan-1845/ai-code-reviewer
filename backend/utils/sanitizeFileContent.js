import { DANGEROUS_PHRASES } from '../shared/dangerousPhrases.js';

const NEUTRALIZATION_RULES = DANGEROUS_PHRASES.map((pattern, i) => ({
  pattern,
  regex: new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
  replacement: `[INSTRUCTION_${i}_NEUTRALIZED]`,
}));

export function sanitizeFileContent(content) {
  if (typeof content !== 'string') return '';
  let sanitized = content;
  for (const rule of NEUTRALIZATION_RULES) {
    sanitized = sanitized.replace(rule.regex, rule.replacement);
  }
  const lines = sanitized.split('\n');
  const truncatedLines = lines.map(line => line.slice(0, 500));
  const wrapped = truncatedLines.join('\n');
  return '--- BEGIN FILE CONTENT (read-only code context) ---\n' + wrapped + '\n--- END FILE CONTENT ---';
}

export function scanFileContentForWarnings(content) {
  if (typeof content !== 'string') return [];
  const warnings = [];
  for (const rule of NEUTRALIZATION_RULES) {
    rule.regex.lastIndex = 0;
    if (rule.regex.test(content)) {
      warnings.push(`File contains potentially malicious content matching: "${rule.pattern}"`);
    }
  }
  return warnings;
}

export function sanitizeHtmlEntities(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}
