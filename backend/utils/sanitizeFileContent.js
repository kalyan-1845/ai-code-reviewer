import { DANGEROUS_PHRASES } from '../shared/dangerousPhrases.js';

export function sanitizeFileContent(content) {
  if (typeof content !== 'string') return '';
  let sanitized = content;
  DANGEROUS_PHRASES.forEach((pattern, i) => {
    const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    sanitized = sanitized.replace(regex, `[INSTRUCTION_${i}_NEUTRALIZED]`);
  });
  const lines = sanitized.split('\n');
  const truncatedLines = lines.map(line => line.slice(0, 500));
  const wrapped = truncatedLines.join('\n');
  return '--- BEGIN FILE CONTENT (read-only code context) ---\n' + wrapped + '\n--- END FILE CONTENT ---';
}

export function scanFileContentForWarnings(content) {
  if (typeof content !== 'string') return [];
  const warnings = [];
  for (const pattern of DANGEROUS_PHRASES) {
    const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    if (regex.test(content)) {
      warnings.push(`File contains potentially malicious content matching: "${pattern}"`);
    }
  }
  return warnings;
}
