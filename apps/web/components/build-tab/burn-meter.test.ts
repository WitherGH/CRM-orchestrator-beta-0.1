import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { BurnMeter, buildBurnMeterView } from './burn-meter';

describe('buildBurnMeterView', () => {
  it('formats the single-number burn label', () => {
    const view = buildBurnMeterView({ capUsd: 10, todayUsd: 3.2 });

    expect(view.label).toBe('$3.20 / $10.00 today');
    expect(view.percent).toBe(32);
    expect(view.tone).toBe('calm');
  });

  it('warms up at 80% and flips over the cap', () => {
    expect(buildBurnMeterView({ capUsd: 10, todayUsd: 8 }).tone).toBe('warming');
    expect(buildBurnMeterView({ capUsd: 10, todayUsd: 12 }).tone).toBe('over');
    expect(buildBurnMeterView({ capUsd: 10, todayUsd: 12 }).percent).toBe(100);
  });

  it('stays calm with a zero cap instead of dividing by zero', () => {
    const view = buildBurnMeterView({ capUsd: 0, todayUsd: 5 });

    expect(view.percent).toBe(0);
    expect(view.tone).toBe('over');
  });
});

describe('BurnMeter', () => {
  it('renders the label and links to insights', () => {
    const markup = renderToStaticMarkup(
      createElement(BurnMeter, { capUsd: 10, todayUsd: 3.2 }),
    );

    expect(markup).toContain('$3.20 / $10.00 today');
    expect(markup).toContain('href="/insights"');
  });
});
