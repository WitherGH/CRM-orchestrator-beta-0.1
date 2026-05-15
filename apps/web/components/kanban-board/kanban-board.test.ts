import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { LiveAgentSnapshot } from '../../server/live-agent-state';
import type { VaultTask } from '../../server/vault-fs';

import {
  KanbanBoard,
  buildKanbanColumns,
  formatTaskAgeLabel,
} from './kanban-board';

describe('KanbanBoard', () => {
  const now = new Date('2026-05-14T12:30:00.000Z');

  it('groups vault tasks into the visible orchestrator columns', () => {
    const columns = buildKanbanColumns(
      [
        createTask({
          id: 'T-101',
          priority: 'P1',
          status: 'backlog',
          title: 'Second backlog task',
        }),
        createTask({
          id: 'T-100',
          priority: 'P0',
          status: 'backlog',
          title: 'First backlog task',
        }),
        createTask({
          id: 'T-102',
          status: 'blocked-question',
          title: 'Blocked task',
        }),
        createTask({
          id: 'T-103',
          status: 'failed',
          title: 'Failed task',
        }),
      ],
    );

    expect(columns.map((column) => column.status)).toEqual([
      'backlog',
      'in-progress',
      'review',
      'merge-ready',
      'failed',
      'done',
    ]);
    expect(columns[0].tasks.map((task) => task.id)).toEqual(['T-100', 'T-101']);
    expect(columns[4].tasks.map((task) => task.id)).toEqual(['T-103']);
    expect(columns.flatMap((column) => column.tasks.map((task) => task.id))).not.toContain(
      'T-102',
    );
  });

  it('collapses done to the five most recently updated tasks', () => {
    const doneTasks = Array.from({ length: 6 }, (_, index) => (
      createTask({
        id: `T-20${index}`,
        status: 'done',
        title: `Done task ${index}`,
        updatedAt: `2026-05-14T10:0${index}:00.000Z`,
      })
    ));

    const doneColumn = buildKanbanColumns(doneTasks).find(
      (column) => column.status === 'done',
    );

    expect(doneColumn?.countLabel).toBe('5/6');
    expect(doneColumn?.tasks.map((task) => task.id)).toEqual([
      'T-205',
      'T-204',
      'T-203',
      'T-202',
      'T-201',
    ]);
  });

  it('formats compact age labels from updated time or created date', () => {
    expect(
      formatTaskAgeLabel(
        createTask({
          status: 'review',
          updatedAt: '2026-05-14T12:29:30.000Z',
        }),
        now,
      ),
    ).toBe('now');
    expect(
      formatTaskAgeLabel(
        createTask({
          status: 'review',
          updatedAt: '2026-05-14T10:00:00.000Z',
        }),
        now,
      ),
    ).toBe('2h');
    expect(
      formatTaskAgeLabel(
        createTask({
          created: '2026-05-01',
          status: 'backlog',
        }),
        now,
      ),
    ).toBe('1w');
  });

  it('renders task cards with required card metadata', () => {
    const html = renderToStaticMarkup(
      createElement(KanbanBoard, {
        now,
        tasks: [
          createTask({
            assignee: 'pm',
            effort: null,
            flagged: true,
            id: 'T-010',
            priority: 'P0',
            status: 'review',
            title: 'Kanban board',
            updatedAt: '2026-05-14T10:00:00.000Z',
          }),
        ],
      }),
    );

    expect(html).toContain('aria-label="Task board"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('draggable="true"');
    expect(html).toContain('Review');
    expect(html).toContain('T-010');
    expect(html).toContain('Kanban board');
    expect(html).toContain('Flagged');
    expect(html).toContain('PM');
    expect(html).toContain('P0');
    expect(html).toContain('effort unset');
    expect(html).toContain('2h');
  });

  it('renders the task detail drawer for the selected kanban task', () => {
    const html = renderToStaticMarkup(
      createElement(KanbanBoard, {
        githubRepository: 'WitherGH/crm-orchestrator-beta-0.1',
        initialSelectedTaskId: 'T-011',
        liveAgentSnapshot: createLiveAgentSnapshot(),
        now,
        tasks: [
          createTask({
            body: '\n## What\nImplement the detail drawer.',
            id: 'T-011',
            metadata: {
              pr_number: 42,
            },
            priority: 'P1',
            status: 'in-progress',
            title: 'Task detail drawer',
          }),
        ],
      }),
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('Task detail');
    expect(html).toContain('Task detail drawer');
    expect(html).toContain('Implement the detail drawer.');
    expect(html).toContain('Adding the drawer shell.');
    expect(html).toContain('href="https://github.com/WitherGH/crm-orchestrator-beta-0.1/pull/42"');
  });
});

function createTask(overrides: Partial<VaultTask> = {}): VaultTask {
  const status = overrides.status ?? 'backlog';

  return {
    assignee: 'developer',
    body: '\n## What\nImplement the task.',
    created: '2026-05-14',
    dependsOn: [],
    effort: 'M',
    flagged: false,
    folderStatus: status,
    frontmatterStatus: status,
    id: 'T-001',
    labels: ['crm'],
    metadata: {},
    path: `04-tasks/${status}/T-001-test.md`,
    priority: 'P2',
    projectId: null,
    spec: 'F-001',
    status,
    title: 'Test task',
    updatedAt: '2026-05-14T12:00:00.000Z',
    ...overrides,
  };
}

function createLiveAgentSnapshot(): LiveAgentSnapshot {
  return {
    activeCount: 1,
    agents: [
      {
        actions: {
          fullLogEnabled: true,
          killEnabled: false,
          pauseEnabled: false,
        },
        costLabel: 'meter pending',
        elapsedLabel: '2m elapsed',
        fullLogHref: '/api/admin/orchestrator/live-agents/log?taskId=T-011',
        lastOutput: 'Adding the drawer shell.',
        logPath: '/worktrees/T-011/.orchestrator-live.log',
        model: 'gpt-5.5',
        role: 'developer',
        roleLabel: 'Developer',
        runner: 'codex',
        status: 'running',
        taskId: 'T-011',
        taskTitle: 'Task detail drawer',
        updatedAt: '2026-05-14T12:02:00.000Z',
      },
    ],
    pollIntervalMs: 5_000,
    refreshedAt: '2026-05-14T12:02:00.000Z',
    totalRoles: 6,
  };
}
