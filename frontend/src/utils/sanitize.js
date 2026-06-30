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
    ALLOWED_ATTR: ['viewBox', 'xmlns', 'd', 'fill', 'stroke', 'stroke-width', 'cx', 'cy', 'r', 'x', 'y', 'width', 'height', 'points', 'transform', 'id', 'class', 'offset', 'stop-color', 'font-size', 'text-anchor'],
    FORBID_TAGS: ['script', 'style', 'foreignObject', 'iframe', 'object', 'embed', 'link', 'meta'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'onsubmit', 'onreset', 'onkeydown', 'onkeyup'],
  });
}

export function sanitizeMermaidOutput(svg) {
  if (!svg || typeof svg !== 'string') return '';
  let sanitized = svg.replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/href\s*=\s*["']\s*javascript:/gi, 'href="#disabled"');
  sanitized = DOMPurify.sanitize(sanitized, {
    ALLOWED_TAGS: ['svg', 'g', 'path', 'circle', 'rect', 'line', 'text', 'tspan', 'defs', 'marker', 'polygon', 'polyline', 'ellipse'],
    ALLOWED_ATTR: ['d', 'fill', 'stroke', 'viewBox', 'x', 'y', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'transform', 'style', 'class'],
  });
  return sanitized;
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
