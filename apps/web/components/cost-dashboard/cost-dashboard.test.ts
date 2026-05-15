import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { CostDashboardData } from '../../server/cost-dashboard';

import { CostDashboard } from './cost-dashboard';

describe('CostDashboard', () => {
  it('renders cap pressure, summary metrics, and per-agent costs', () => {
    const html = renderToStaticMarkup(createElement(CostDashboard, { data: createData() }));

    expect(html).toContain('aria-labelledby="orchestrator-cost-title"');
    expect(html).toContain('Spend by agent');
    expect(html).toContain('Cap hit');
    expect(html).toContain('$20.00 / $20.00');
    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain('30d run rate');
    expect(html).toContain('$102.86');
    expect(html).toContain('Developer');
    expect(html).toContain('$4.00 / task');
    expect(html).toContain('67%');
  });

  it('renders the daily cost ledger by role', () => {
    const html = renderToStaticMarkup(createElement(CostDashboard, { data: createData() }));

    expect(html).toContain('Daily cost ledger by agent');
    expect(html).toContain('May 14');
    expect(html).toContain('May 13');
    expect(html).toContain('$12.00');
    expect(html).toContain('$8.00');
  });
});

function createData(): CostDashboardData {
  return {
    cap: {
      dailyCapLabel: '$20.00',
      progressPercent: 100,
      remainingLabel: '$0.00',
      statusLabel: 'Cap hit',
      tone: 'critical',
    },
    dayRows: [
      {
        costLabelsByRole: {
          architect: '$0.00',
          designer: '$0.00',
          developer: '$12.00',
          pm: '$0.00',
          reviewer: '$8.00',
          tester: '$0.00',
        },
        dateKey: '2026-05-14',
        dayLabel: 'May 14',
        totalLabel: '$20.00',
      },
      {
        costLabelsByRole: {
          architect: '$0.00',
          designer: '$0.00',
          developer: '$4.00',
          pm: '$0.00',
          reviewer: '$0.00',
          tester: '$0.00',
        },
        dateKey: '2026-05-13',
        dayLabel: 'May 13',
        totalLabel: '$4.00',
      },
    ],
    generatedAt: '2026-05-14T12:00:00.000Z',
    roleRows: [
      {
        averageCostPerTaskLabel: '$4.00 / task',
        role: 'developer',
        roleLabel: 'Developer',
        shareLabel: '67%',
        tasksCompletedWeek: 4,
        todayLabel: '$12.00',
        weekLabel: '$16.00',
      },
      {
        averageCostPerTaskLabel: '$8.00 / task',
        role: 'reviewer',
        roleLabel: 'Reviewer',
        shareLabel: '33%',
        tasksCompletedWeek: 1,
        todayLabel: '$8.00',
        weekLabel: '$8.00',
      },
    ],
    summary: {
      monthlyProjectionLabel: '$102.86',
      tasksCompletedWeek: 5,
      todayLabel: '$20.00',
      weekLabel: '$24.00',
    },
  };
}
