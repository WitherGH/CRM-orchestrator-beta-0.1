import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { AgentBoardData } from '../../server/agent-board';

import { AgentBoardModal } from './agent-board-modal';

describe('AgentBoardModal', () => {
  it('renders the modal surface with summary metrics and all role rows', () => {
    const html = renderToStaticMarkup(createElement(AgentBoardModal, { data: createData() }));

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('id="orchestrator-agent-board-modal"');
    expect(html).toContain('Current capacity and 7d performance');
    expect(html).toContain('2/6');
    expect(html).toContain('83% success');
    expect(html).toContain('Developer');
    expect(html).toContain('Reviewer');
    expect(html).toContain('T-017');
    expect(html).toContain('$1.25 / task');
  });

  it('renders clear idle and empty queue states', () => {
    const html = renderToStaticMarkup(createElement(AgentBoardModal, { data: createData() }));

    expect(html).toContain('Designer');
    expect(html).toContain('Idle');
    expect(html).toContain('Queue clear.');
  });
});

function createData(): AgentBoardData {
  return {
    generatedAt: '2026-05-14T12:00:00.000Z',
    roles: [
      {
        activeTaskId: 'T-017',
        activeTaskTitle: 'Agent board modal and cost dashboard',
        averageCostPerTaskLabel: '$1.25 / task',
        averageTaskTimeLabel: '22m',
        costTodayLabel: '$2.00',
        costWeekLabel: '$5.00',
        model: 'gpt-5.5',
        queueCount: 1,
        queuePreview: [
          {
            id: 'T-017',
            priority: 'P1',
            status: 'in-progress',
            title: 'Agent board modal and cost dashboard',
          },
        ],
        role: 'developer',
        roleLabel: 'Developer',
        runner: 'codex',
        status: 'running',
        successRateLabel: '83% success',
        successRatePercent: 83,
        tasksCompletedWeek: 4,
      },
      {
        activeTaskId: null,
        activeTaskTitle: null,
        averageCostPerTaskLabel: 'no completions',
        averageTaskTimeLabel: 'no finished runs',
        costTodayLabel: '$0.00',
        costWeekLabel: '$0.00',
        model: 'sonnet',
        queueCount: 0,
        queuePreview: [],
        role: 'designer',
        roleLabel: 'Designer',
        runner: 'claude',
        status: 'idle',
        successRateLabel: 'no finished runs',
        successRatePercent: null,
        tasksCompletedWeek: 0,
      },
      {
        activeTaskId: null,
        activeTaskTitle: null,
        averageCostPerTaskLabel: '$0.80 / task',
        averageTaskTimeLabel: '18m',
        costTodayLabel: '$1.00',
        costWeekLabel: '$4.00',
        model: 'opus',
        queueCount: 2,
        queuePreview: [],
        role: 'reviewer',
        roleLabel: 'Reviewer',
        runner: 'claude',
        status: 'idle',
        successRateLabel: '80% success',
        successRatePercent: 80,
        tasksCompletedWeek: 5,
      },
    ],
    summary: {
      activeAgents: 2,
      averageSuccessRateLabel: '83% success',
      queuedTasks: 3,
      totalAgents: 6,
      weekCostLabel: '$9.00',
    },
  };
}
