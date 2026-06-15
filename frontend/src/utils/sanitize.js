import DOMPurify from 'dompurify';

export function sanitizeHTML(dirty) {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  });
}

export function sanitizeForStorage(dirty) {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['svg', 'g', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'text', 'tspan', 'defs', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'stop', 'marker'],
    ALLOWED_ATTR: ['viewBox', 'xmlns', 'd', 'fill', 'stroke', 'stroke-width', 'cx', 'cy', 'r', 'x', 'y', 'width', 'height', 'points', 'transform', 'id', 'class', 'style', 'offset', 'stop-color', 'font-size', 'text-anchor'],
    FORBID_TAGS: ['script', 'style', 'foreignObject', 'iframe', 'object', 'embed', 'link', 'meta'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit', 'onreset', 'onkeydown', 'onkeyup'],
  });
}

export function sanitizeAuditEntry(entry) {
  if (!entry) return entry;
  const sanitized = { ...entry };
  if (sanitized.response?.analysis?.mermaidDiagram) {
    sanitized.response.analysis.mermaidDiagram = sanitizeForStorage(sanitized.response.analysis.mermaidDiagram);
  }
  return sanitized;
}

export function sanitizeJSON(data) {
  if (!data) return '';
  const cleaned = sanitizeHTML(data);
  return cleaned;
}
