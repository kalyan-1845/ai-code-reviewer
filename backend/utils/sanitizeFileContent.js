const DANGEROUS_PATTERNS = [
  'ignore all previous instructions',
  'ignore all instructions',
  'forget all previous',
  'you are now',
  'from now on',
  'override all',
  'system override',
  'new directive',
  'protocol change',
  'disregard all',
  'you will now',
  'you must now',
];

export function sanitizeFileContent(content) {
  if (typeof content !== 'string') return '';
  let sanitized = content;
  DANGEROUS_PATTERNS.forEach((pattern, i) => {
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
  for (const pattern of DANGEROUS_PATTERNS) {
    const regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    if (regex.test(content)) {
      warnings.push(`File contains potentially malicious content matching: "${pattern}"`);
    }
  }
  return warnings;
}
