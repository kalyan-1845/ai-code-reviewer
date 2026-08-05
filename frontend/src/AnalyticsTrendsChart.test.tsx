import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import AnalyticsTrendsChart from './AnalyticsTrendsChart';

// Regression tests for #3668: when the trends aggregation omits a series key
// for a given day, the chart used to compute Math.max(1, ...undefined) === NaN,
// which produced invalid SVG coordinates ("NaN" in d/cy attributes).
vi.mock('./utils/api', () => ({
  apiFetch: vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      trends: [
        {
          date: '2026-08-01',
          analyses: 1,
          totalFindings: 5,
          avgHealthScore: 90,
          totalBugs: 2,
          totalSecurityIssues: 1,
        },
        // Second day is missing series values (as the aggregation can return).
        {
          date: '2026-08-02',
          analyses: 1,
          totalFindings: undefined,
          avgHealthScore: 80,
          totalBugs: undefined,
          totalSecurityIssues: undefined,
        },
      ],
    }),
  }),
}));

describe('AnalyticsTrendsChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders SVG coordinates without NaN when a trend point is missing series values', async () => {
    const { container } = render(<AnalyticsTrendsChart />);

    await screen.findByText(/Issue Trends Over Time/i);

    const paths = Array.from(container.querySelectorAll('path'));
    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(path.getAttribute('d')).not.toContain('NaN');
    }

    const circles = Array.from(container.querySelectorAll('circle'));
    expect(circles.length).toBeGreaterThan(0);
    for (const circle of circles) {
      expect(circle.getAttribute('cy')).not.toContain('NaN');
    }
  });

  it('coerces missing values to zero in tooltips', async () => {
    const { container } = render(<AnalyticsTrendsChart />);

    await screen.findByText(/Issue Trends Over Time/i);

    const titles = Array.from(container.querySelectorAll('circle title')).map(
      (t) => t.textContent || ''
    );
    expect(titles).toContain('Bugs: 0 (8/2)');
  });
});
