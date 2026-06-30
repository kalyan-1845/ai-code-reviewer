import { describe, it, expect } from 'vitest';
import { sanitizeHTML, sanitizeForStorage, sanitizeAuditEntry, sanitizeJSON, sanitizeMermaidOutput } from './sanitize.js';

describe('sanitizeHTML', () => {
  it('strips all tags when ALLOWED_TAGS is empty', () => {
    const result = sanitizeHTML('<script>alert(1)</script>');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert(1)');
  });

  it('returns empty string for null/undefined input', () => {
    expect(sanitizeHTML(null)).toBe('');
    expect(sanitizeHTML(undefined)).toBe('');
  });
});

describe('sanitizeForStorage', () => {
  it('allows SVG elements (g, path, circle, rect)', () => {
    const svg = '<svg><g><path d="M0 0"/><circle cx="5" cy="5" r="2"/></g></svg>';
    const result = sanitizeForStorage(svg);
    expect(result).toContain('<svg>');
    expect(result).toContain('<g>');
    expect(result).toContain('<path');
    expect(result).toContain('<circle');
  });

  it('allows text and tspan elements', () => {
    const diagram = '<svg><text x="10" y="20"><tspan font-size="12" text-anchor="middle">label</tspan></text></svg>';
    const result = sanitizeForStorage(diagram);
    expect(result).toContain('<text');
    expect(result).toContain('<tspan');
  });

  it('blocks script tags', () => {
    const malicious = '<script>alert(document.cookie)</script><svg><path/></svg>';
    const result = sanitizeForStorage(malicious);
    expect(result).not.toContain('<script>');
    expect(result).toContain('<svg>');
    expect(result).toContain('<path');
  });

  it('blocks onerror event handler', () => {
    const malicious = '<img src="x" onerror="alert(1)"/>';
    const result = sanitizeForStorage(malicious);
    expect(result).not.toContain('onerror');
  });

  it('blocks onclick event handler', () => {
    const malicious = '<div onclick="evil()">click me</div>';
    const result = sanitizeForStorage(malicious);
    expect(result).not.toContain('onclick');
  });

  it('blocks onload event handler', () => {
    const malicious = '<svg><svg onload="steal()"/></svg>';
    const result = sanitizeForStorage(malicious);
    expect(result).not.toContain('onload');
  });

  it('allows allowed attributes (viewBox, d, fill, stroke)', () => {
    const svg = '<svg viewBox="0 0 100 100"><path d="M0 0" fill="red" stroke="black" stroke-width="2"/></svg>';
    const result = sanitizeForStorage(svg);
    expect(result).toContain('viewBox="0 0 100 100"');
    expect(result).toContain('d="M0 0"');
    expect(result).toContain('fill="red"');
  });
});

describe('sanitizeAuditEntry', () => {
  it('returns null/undefined entry unchanged', () => {
    expect(sanitizeAuditEntry(null)).toBeNull();
    expect(sanitizeAuditEntry(undefined)).toBeUndefined();
  });

  it('preserves non-mermaidDiagram fields', () => {
    const entry = { repo: 'test/repo', branch: 'main', status: 'ok' };
    const result = sanitizeAuditEntry(entry);
    expect(result.repo).toBe('test/repo');
    expect(result.branch).toBe('main');
    expect(result.status).toBe('ok');
  });

  it('sanitizes mermaidDiagram field when present', () => {
    const entry = {
      response: {
        analysis: {
          mermaidDiagram: '<script>bad()</script><svg><path/></svg>'
        }
      }
    };
    const result = sanitizeAuditEntry(entry);
    expect(result.response.analysis.mermaidDiagram).not.toContain('<script>');
    expect(result.response.analysis.mermaidDiagram).toContain('<svg>');
  });
});

describe('sanitizeJSON', () => {
  it('delegates to sanitizeHTML', () => {
    const dirty = '<b>bold</b><script>bad()</script>';
    const result = sanitizeJSON(dirty);
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('<b>');
  });

  it('returns empty string for null/undefined', () => {
    expect(sanitizeJSON(null)).toBe('');
    expect(sanitizeJSON(undefined)).toBe('');
  });
});

describe('sanitizeMermaidOutput', () => {
  it('returns empty string for null/undefined', () => {
    expect(sanitizeMermaidOutput(null)).toBe('');
    expect(sanitizeMermaidOutput(undefined)).toBe('');
  });

  it('removes inline event handlers from SVG', () => {
    const svg = '<svg><path d="M0 0" onmouseover="steal()"/></svg>';
    const result = sanitizeMermaidOutput(svg);
    expect(result).not.toContain('onmouseover');
  });

  it('sanitizes href javascript: in SVG', () => {
    const svg = '<svg><a href="javascript:alert(1)"><text>click</text></a></svg>';
    const result = sanitizeMermaidOutput(svg);
    expect(result).not.toContain('javascript:');
  });

  it('preserves valid SVG elements and attributes', () => {
    const svg = '<svg viewBox="0 0 100 100"><g><path d="M0 0" fill="blue"/><circle cx="10" cy="10" r="5"/></g></svg>';
    const result = sanitizeMermaidOutput(svg);
    expect(result).toContain('<svg');
    expect(result).toContain('<path');
    expect(result).toContain('<circle');
    expect(result).toContain('fill="blue"');
  });

  it('blocks script tags in SVG', () => {
    const svg = '<svg><script>evil()</script><path d="M0 0"/></svg>';
    const result = sanitizeMermaidOutput(svg);
    expect(result).not.toContain('<script>');
    expect(result).toContain('<path');
  });
});
