export function sanitizeRedisKey(input, maxLength = 128) {
  if (typeof input !== 'string' || input.length === 0) {
    return '_empty_';
  }
  let sanitized = input
    .replace(/[\r\n\x00-\x1f\x7f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^\w\-:.]/g, '_');
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }
  if (sanitized.startsWith(':') || sanitized.startsWith('-')) {
    sanitized = '_' + sanitized;
  }
  return sanitized;
}
