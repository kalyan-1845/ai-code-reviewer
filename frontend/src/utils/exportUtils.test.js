// Frontend unit tests for generateMarkdownReport in exportUtils.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateMarkdownReport, handlePdfExport } from './exportUtils.ts';

const { saveMock } = vi.hoisted(() => ({
  saveMock: vi.fn(),
}));

vi.mock('html2pdf.js', () => ({
  default: vi.fn(() => ({
    set: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    save: saveMock,
  })),
}));

describe('generateMarkdownReport', () => {
  it('generates report with header containing repo name', () => {
    const report = generateMarkdownReport('test-repo', { fileReviews: {} });
    expect(report).toContain('test-repo');
    expect(report).toContain('RepoSage AI Code Audit Report');
  });

  it('shows no issues message when fileReviews is empty', () => {
    const report = generateMarkdownReport('test-repo', { fileReviews: {} });
    expect(report).toContain('No issues found');
  });

  it('shows no issues message when fileReviews is null', () => {
    const report = generateMarkdownReport('test-repo', null);
    expect(report).toContain('No issues found');
  });

  it('summarizes bug findings correctly', () => {
    const analysis = {
      fileReviews: {
        'src/index.js': {
          bugs: [{ type: 'null-check', line: 42, description: 'Missing null check', suggestion: 'Add null check' }],
          security: [], optimization: [], styling: []
        }
      }
    };
    const report = generateMarkdownReport('test-repo', analysis);
    expect(report).toContain('**Bugs:** 1');
    expect(report).toContain('Missing null check');
  });

  it('summarizes security findings correctly', () => {
    const analysis = {
      fileReviews: {
        'auth.js': {
          bugs: [],
          security: [{ type: 'hardcoded-secret', line: 10, description: 'Hardcoded API key', suggestion: 'Use env var' }],
          optimization: [], styling: []
        }
      }
    };
    const report = generateMarkdownReport('test-repo', analysis);
    expect(report).toContain('**Security Issues:** 1');
    expect(report).toContain('Hardcoded API key');
  });

  it('summarizes optimization and styling findings', () => {
    const analysis = {
      fileReviews: {
        'utils.js': {
          bugs: [],
          security: [],
          optimization: [{ type: 'inefficient-loop', line: 5, description: 'Nested loop', suggestion: 'Cache' }],
          styling: [{ type: 'unused-import', line: 1, description: 'Unused import', suggestion: 'Remove' }]
        }
      }
    };
    const report = generateMarkdownReport('test-repo', analysis);
    expect(report).toContain('**Performance Optimizations:** 1');
    expect(report).toContain('**Style Violations:** 1');
  });

  it('escapes pipe characters in finding fields', () => {
    const analysis = {
      fileReviews: {
        'a|b.js': {
          bugs: [{ type: 't', line: 1, description: 'desc|ription', suggestion: 'sug|gestion' }],
          security: [], optimization: [], styling: []
        }
      }
    };
    const report = generateMarkdownReport('test-repo', analysis);
    expect(report).toContain('a&#124;b.js');
    expect(report).toContain('desc&#124;ription');
    expect(report).toContain('sug&#124;gestion');
  });

  it('includes metrics table when metrics are present', () => {
    const analysis = {
      fileReviews: {},
      metrics: {
        'src/index.js': { totalLines: 100, codeLines: 80, commentLines: 10, emptyLines: 10, functionCount: 5, complexityScore: 7, grade: 'B' }
      }
    };
    const report = generateMarkdownReport('test-repo', analysis);
    expect(report).toContain('Code Metrics');
    expect(report).toContain('src/index.js');
    expect(report).toContain('B');
  });

  it('escapes pipe characters in metric file paths', () => {
    const analysis = {
      fileReviews: {},
      metrics: {
        'src/a|b.js': { totalLines: 1, codeLines: 1, commentLines: 0, emptyLines: 0, functionCount: 0, complexityScore: 1, grade: 'A|B' }
      }
    };
    const report = generateMarkdownReport('test-repo', analysis);
    expect(report).toContain('src/a&#124;b.js');
    expect(report).toContain('A&#124;B');
  });

  it('does not include metrics table when metrics is empty', () => {
    const report = generateMarkdownReport('test-repo', { fileReviews: {}, metrics: {} });
    expect(report).not.toContain('Code Metrics');
  });

  it('handles multiple files with multiple finding types', () => {
    const analysis = {
      fileReviews: {
        'file1.js': {
          bugs: [{ type: 't', line: 1, description: 'd', suggestion: 's' }],
          security: [], optimization: [], styling: []
        },
        'file2.js': {
          bugs: [],
          security: [{ type: 't', line: 2, description: 'd', suggestion: 's' }],
          optimization: [], styling: []
        }
      }
    };
    const report = generateMarkdownReport('test-repo', analysis);
    expect(report).toContain('Total Findings:** 2');
  });

  it('includes copyright footer', () => {
    const report = generateMarkdownReport('test-repo', { fileReviews: {} });
    expect(report).toContain('RepoSage AI');
    expect(report).toContain('GirlScript Summer of Code');
  });
});

describe('handlePdfExport theme restore', () => {
  beforeEach(() => {
    saveMock.mockReset();
    document.documentElement.removeAttribute('data-theme');
  });

  it('restores the original theme when the PDF export fails (regression #3671)', async () => {
    vi.stubGlobal('alert', vi.fn());
    document.documentElement.setAttribute('data-theme', 'dark');
    saveMock.mockRejectedValue(new Error('boom'));

    await handlePdfExport('test-repo', document.createElement('div'));

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    vi.unstubAllGlobals();
  });

  it('restores the original theme after a successful export', async () => {
    vi.stubGlobal('alert', vi.fn());
    document.documentElement.setAttribute('data-theme', 'dark');
    saveMock.mockResolvedValue(undefined);

    await handlePdfExport('test-repo', document.createElement('div'));

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    vi.unstubAllGlobals();
  });

  it('removes the data-theme attribute when no theme was set before export', async () => {
    vi.stubGlobal('alert', vi.fn());
    saveMock.mockRejectedValue(new Error('boom'));

    await handlePdfExport('test-repo', document.createElement('div'));

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    vi.unstubAllGlobals();
  });
});
