import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import HealthScoreGauge from './HealthScoreGauge';

describe('HealthScoreGauge', () => {
  it('keeps the SVG gradient id stable across rerenders', () => {
    const fileReviews = {
      'src/app.ts': {
        bugs: [{ type: 'bug', line: 1, description: 'test', suggestion: 'fix' }],
      },
    };

    const { container, rerender } = render(
      <HealthScoreGauge fileReviews={fileReviews} theme="dark" />
    );
    const firstGradientId = container.querySelector('linearGradient')?.id;
    const firstStroke = container.querySelector('circle.gauge-circle')?.getAttribute('stroke');

    rerender(<HealthScoreGauge fileReviews={fileReviews} theme="light" />);

    expect(container.querySelector('linearGradient')?.id).toBe(firstGradientId);
    expect(container.querySelector('circle.gauge-circle')?.getAttribute('stroke')).toBe(firstStroke);
  });
});
