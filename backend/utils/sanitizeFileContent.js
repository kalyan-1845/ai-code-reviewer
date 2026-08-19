import { DANGEROUS_PHRASES } from '../shared/dangerousPhrases.js';

const COMPILED_DANGEROUS_PATTERNS = (DANGEROUS_PHRASES || []).map((pattern, i) => ({
  index: i,
  pattern,
  regex: new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
}));

export function sanitizeFileContent(content) {
  if (typeof content !== 'string') return '';
  let sanitized = content;
  for (const { index, regex } of COMPILED_DANGEROUS_PATTERNS) {
    regex.lastIndex = 0;
    sanitized = sanitized.replace(regex, `[INSTRUCTION_${index}_NEUTRALIZED]`);
  }
  const lines = sanitized.split('\n');
  const truncatedLines = lines.map(line => line.slice(0, 500));
  const wrapped = truncatedLines.join('\n');
  return '--- BEGIN FILE CONTENT (read-only code context) ---\n' + wrapped + '\n--- END FILE CONTENT ---';
}

export function scanFileContentForWarnings(content) {
  if (typeof content !== 'string') return [];
  const warnings = [];
  for (const { pattern, regex } of COMPILED_DANGEROUS_PATTERNS) {
    regex.lastIndex = 0;
    if (regex.test(content)) {
      warnings.push(`File contains potentially malicious content matching: "${pattern}"`);
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
    .replace(/'/g, '&#x27;');
}
