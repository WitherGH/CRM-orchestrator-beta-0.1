import { describe, expect, it } from 'vitest';

import type { VaultTask } from '../../server/vault-fs';

import {
  buildBuildColumns,
  DONE_VISIBLE_LIMIT,
  resolveBuildColumn,
} from './build-columns';

describe('buildBuildColumns', () => {
  it('maps the seven vault statuses onto the four display columns', () => {
    expect(resolveBuildColumn('backlog')).toEqual({ badge: null, key: 'queue' });
    expect(resolveBuildColumn('in-progress')).toEqual({ badge: null, key: 'working' });
    expect(resolveBuildColumn('blocked-question')).toEqual({ badge: 'question', key: 'working' });
    expect(resolveBuildColumn('review')).toEqual({ badge: null, key: 'review' });
    expect(resolveBuildColumn('merge-ready')).toEqual({ badge: 'merge-ready', key: 'review' });
    expect(resolveBuildColumn('failed')).toEqual({ badge: 'error', key: 'review' });
    expect(resolveBuildColumn('done')).toEqual({ badge: null, key: 'done' });
  });

  it('groups tasks with badges for blocked questions and failures', () => {
    const columns = buildBuildColumns([
      createTask({ id: 'T-001', status: 'backlog' }),
      createTask({ id: 'T-002', status: 'in-progress' }),
      createTask({ id: 'T-003', status: 'blocked-question' }),
      createTask({ id: 'T-004', status: 'review' }),
      createTask({ id: 'T-005', status: 'merge-ready' }),
      createTask({ id: 'T-006', status: 'failed' }),
      createTask({ id: 'T-007', status: 'done' }),
    ]);

    expect(columns.map((column) => column.key)).toEqual(['queue', 'working', 'review', 'done']);
    expect(columns[0]?.cards.map((card) => card.task.id)).toEqual(['T-001']);
    expect(columns[1]?.cards.map((card) => card.task.id)).toEqual(['T-002', 'T-003']);
    expect(columns[1]?.cards.map((card) => card.badge)).toEqual([null, 'question']);
    expect(columns[2]?.cards.map((card) => card.task.id)).toEqual(['T-004', 'T-005', 'T-006']);
    expect(columns[2]?.cards.map((card) => card.badge)).toEqual([null, 'merge-ready', 'error']);
    expect(columns[3]?.cards.map((card) => card.task.id)).toEqual(['T-007']);
  });

  it('sorts active columns by priority before task id', () => {
    const columns = buildBuildColumns([
      createTask({ id: 'T-020', priority: 'P2', status: 'backlog' }),
      createTask({ id: 'T-021', priority: 'P0', status: 'backlog' }),
      createTask({ id: 'T-019', priority: 'P2', status: 'backlog' }),
    ]);

    expect(columns[0]?.cards.map((card) => card.task.id)).toEqual(['T-021', 'T-019', 'T-020']);
  });

  it('shows only recent done tasks while keeping the total count', () => {
    const doneTasks = Array.from({ length: DONE_VISIBLE_LIMIT + 3 }, (_, index) =>
      createTask({
        id: `T-${100 + index}`,
        status: 'done',
        updatedAt: new Date(Date.UTC(2026, 6, 1, index)).toISOString(),
      }));

    const columns = buildBuildColumns(doneTasks);
    const doneColumn = columns[3];

    expect(doneColumn?.cards).toHaveLength(DONE_VISIBLE_LIMIT);
    expect(doneColumn?.totalCount).toBe(DONE_VISIBLE_LIMIT + 3);
    expect(doneColumn?.cards[0]?.task.id).toBe(`T-${100 + DONE_VISIBLE_LIMIT + 2}`);
  });
});

function createTask(overrides: Partial<VaultTask> & Pick<VaultTask, 'id' | 'status'>): VaultTask {
  return {
    assignee: 'developer',
    body: '',
    created: '2026-07-01',
    dependsOn: [],
    effort: null,
    flagged: false,
    folderStatus: null,
    frontmatterStatus: overrides.status,
    labels: [],
    metadata: {},
    path: `02-tasks/${overrides.status}/${overrides.id}.md`,
    priority: 'P2',
    projectId: null,
    spec: null,
    title: `Task ${overrides.id}`,
    updatedAt: '2026-07-05T12:00:00.000Z',
    ...overrides,
  };
}
