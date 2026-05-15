import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  createTopStatBarData,
  TopStatBar,
  type TopStatBarData,
} from './top-stat-bar';

describe('createTopStatBarData', () => {
  it('counts visible kanban states and ignores non-kanban task states', () => {
    const data = createTopStatBarData({
      tasks: [
        { status: 'backlog' },
        { status: 'backlog' },
        { status: 'in-progress' },
        { status: 'review' },
        { status: 'merge-ready' },
        { status: 'done' },
        { status: 'failed' },
        { status: 'blocked-question' },
      ],
    });

    expect(data.taskCounts).toEqual({
      backlog: 2,
      done: 1,
      failed: 1,
      'in-progress': 1,
      'merge-ready': 1,
      review: 1,
    });
  });

  it('sums only today cost rows and active runs', () => {
    const data = createTopStatBarData({
      dailyCosts: [
        {
          costUsd: 18,
          date: new Date('2026-05-14T00:00:00.000Z'),
        },
        {
          costUsd: 9,
          date: new Date('2026-05-13T00:00:00.000Z'),
        },
      ],
      now: new Date('2026-05-14T12:00:00.000Z'),
      recentRuns: [
        { status: 'running' },
        { status: 'queued' },
        { status: 'running' },
      ],
      tasks: [],
    });

    expect(data.cost.todayUsd).toBe(18);
    expect(data.cost.progressPercent).toBe(36);
    expect(data.agents.active).toBe(2);
  });

  it('marks halted bots when any halt count is present', () => {
    const data = createTopStatBarData({
      haltedBotCount: 2,
      tasks: [],
    });

    expect(data.botKill).toEqual({
      haltedCount: 2,
      status: 'halted',
    });
  });
});

describe('TopStatBar', () => {
  it('renders task counts as kanban filter links', () => {
    const html = renderToStaticMarkup(createElement(TopStatBar, { data: createData() }));

    expect(html).toContain('aria-label="Orchestrator stats"');
    expect(html).toContain('href="/admin/orchestrator?status=backlog"');
    expect(html).toContain('aria-label="4 backlog tasks"');
    expect(html).toContain('href="/admin/orchestrator?status=in-progress"');
    expect(html).toContain('in-flight');
    expect(html).toContain('href="/admin/orchestrator?status=failed"');
    expect(html).toContain('href="/admin/orchestrator?status=done"');
    expect(html).toContain('href="#orchestrator-agent-board-modal"');
    expect(html).toContain('Open agent board, 2 active agents');
  });

  it('uses alert and critical tones for cap pressure, failed CI, and halted bots', () => {
    const html = renderToStaticMarkup(
      createElement(TopStatBar, {
        data: createData({
          botKill: {
            haltedCount: 1,
            status: 'halted',
          },
          ci: {
            detail: '1 failing',
            status: 'red',
          },
          cost: {
            dailyCapUsd: 50,
            progressPercent: 92,
            todayUsd: 46,
          },
        }),
      }),
    );

    expect(html).toContain('$46.00 today');
    expect(html).toContain('aria-valuenow="92"');
    expect(html).toContain('data-tone="alert"');
    expect(html).toContain('Red');
    expect(html).toContain('1 failing');
    expect(html).toContain('Halted');
    expect(html).toContain('1 halted');
    expect(html).toContain('data-tone="critical"');
  });
});

function createData(overrides: Partial<TopStatBarData> = {}): TopStatBarData {
  return {
    agents: {
      active: 2,
      total: 6,
    },
    botKill: {
      haltedCount: 0,
      status: 'clear',
    },
    ci: {
      status: 'green',
    },
    cost: {
      dailyCapUsd: 50,
      progressPercent: 28,
      todayUsd: 14,
    },
    taskCounts: {
      backlog: 4,
      done: 8,
      failed: 1,
      'in-progress': 3,
      'merge-ready': 1,
      review: 2,
    },
    ...overrides,
  };
}
