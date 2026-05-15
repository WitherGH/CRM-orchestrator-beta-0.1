import { describe, expect, it } from 'vitest';

import type { DailyCost } from '@crm-orchestrator/db/schema';

import {
  buildCostDashboardData,
  type CostDashboardData,
} from './cost-dashboard';

describe('buildCostDashboardData', () => {
  it('builds cap pressure, role totals, and seven daily cost rows', () => {
    const data = createCostDashboardData();
    const developer = data.roleRows.find((row) => row.role === 'developer');
    const reviewer = data.roleRows.find((row) => row.role === 'reviewer');

    expect(data.summary).toEqual({
      monthlyProjectionLabel: '$102.86',
      tasksCompletedWeek: 5,
      todayLabel: '$20.00',
      weekLabel: '$24.00',
    });
    expect(data.cap).toEqual({
      dailyCapLabel: '$20.00',
      progressPercent: 100,
      remainingLabel: '$0.00',
      statusLabel: 'Cap hit',
      tone: 'critical',
    });
    expect(developer).toMatchObject({
      averageCostPerTaskLabel: '$4.00 / task',
      roleLabel: 'Developer',
      shareLabel: '67%',
      tasksCompletedWeek: 4,
      todayLabel: '$12.00',
      weekLabel: '$16.00',
    });
    expect(reviewer).toMatchObject({
      averageCostPerTaskLabel: '$8.00 / task',
      roleLabel: 'Reviewer',
      shareLabel: '33%',
      tasksCompletedWeek: 1,
      todayLabel: '$8.00',
      weekLabel: '$8.00',
    });
  });

  it('renders per-agent daily cost labels for each day in the window', () => {
    const data = createCostDashboardData();

    expect(data.dayRows).toHaveLength(7);
    expect(data.dayRows[0]).toMatchObject({
      costLabelsByRole: expect.objectContaining({
        developer: '$12.00',
        reviewer: '$8.00',
        tester: '$0.00',
      }) as Record<string, string>,
      dateKey: '2026-05-14',
      dayLabel: 'May 14',
      totalLabel: '$20.00',
    });
    expect(data.dayRows[1]).toMatchObject({
      costLabelsByRole: expect.objectContaining({
        developer: '$4.00',
      }) as Record<string, string>,
      dateKey: '2026-05-13',
      totalLabel: '$4.00',
    });
  });

  it('keeps zero-cost dashboards explicit', () => {
    const data = buildCostDashboardData({
      dailyCosts: [],
      now: new Date('2026-05-14T12:00:00.000Z'),
    });

    expect(data.summary.weekLabel).toBe('$0.00');
    expect(data.cap.statusLabel).toBe('Within cap');
    expect(data.roleRows.find((row) => row.role === 'pm')).toMatchObject({
      averageCostPerTaskLabel: 'no completions',
      shareLabel: '0%',
      weekLabel: '$0.00',
    });
  });
});

function createCostDashboardData(): CostDashboardData {
  return buildCostDashboardData({
    dailyCapUsd: 20,
    dailyCosts: [
      createDailyCost({
        agentRole: 'developer',
        costUsd: 12,
        date: new Date('2026-05-14T00:00:00.000Z'),
        tasksCompleted: 3,
      }),
      createDailyCost({
        agentRole: 'reviewer',
        costUsd: 8,
        date: new Date('2026-05-14T00:00:00.000Z'),
        tasksCompleted: 1,
      }),
      createDailyCost({
        agentRole: 'developer',
        costUsd: 4,
        date: new Date('2026-05-13T00:00:00.000Z'),
        tasksCompleted: 1,
      }),
      createDailyCost({
        agentRole: 'tester',
        costUsd: 99,
        date: new Date('2026-05-01T00:00:00.000Z'),
        tasksCompleted: 6,
      }),
    ],
    now: new Date('2026-05-14T12:00:00.000Z'),
  });
}

function createDailyCost(overrides: Partial<DailyCost> = {}): DailyCost {
  return {
    agentRole: 'developer',
    costUsd: 1,
    date: new Date('2026-05-14T00:00:00.000Z'),
    tasksCompleted: 1,
    ...overrides,
  };
}
