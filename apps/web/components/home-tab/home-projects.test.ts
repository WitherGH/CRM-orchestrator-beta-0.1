import { describe, expect, it } from 'vitest';

import type { VaultProject, VaultTask } from '../../server/vault-fs';

import { buildHomeProjectCards } from './home-projects';

describe('buildHomeProjectCards', () => {
  it('computes progress, activity, attention, and burn per project', () => {
    const cards = buildHomeProjectCards({
      projects: [createProject({ id: 'crm', title: 'CRM' })],
      taskCostsUsd: { 'T-001': 0.3, 'T-002': 0.12, 'T-999': 5 },
      tasks: [
        createTask({ id: 'T-001', projectId: 'crm', status: 'done' }),
        createTask({ id: 'T-002', projectId: 'crm', status: 'in-progress' }),
        createTask({ id: 'T-003', projectId: 'crm', status: 'blocked-question' }),
        createTask({ flagged: true, id: 'T-004', projectId: 'crm', status: 'review' }),
        createTask({ id: 'T-999', projectId: 'other', status: 'done' }),
      ],
    });

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      attentionCount: 2,
      doneCount: 1,
      id: 'crm',
      progressPercent: 25,
      taskCount: 4,
      workingCount: 1,
    });
    expect(cards[0]?.todayUsd).toBeCloseTo(0.42);
  });

  it('sorts active projects first, then alphabetically', () => {
    const cards = buildHomeProjectCards({
      projects: [
        createProject({ id: 'b', status: 'paused', title: 'Beta' }),
        createProject({ id: 'z', title: 'Zulu' }),
        createProject({ id: 'a', title: 'Alpha' }),
      ],
      tasks: [],
    });

    expect(cards.map((card) => card.id)).toEqual(['a', 'z', 'b']);
  });

  it('reports zero progress for a project without tasks', () => {
    const cards = buildHomeProjectCards({
      projects: [createProject({ id: 'empty', title: 'Empty' })],
      tasks: [],
    });

    expect(cards[0]).toMatchObject({ progressPercent: 0, taskCount: 0, todayUsd: 0 });
  });
});

function createProject(
  overrides: Partial<VaultProject> & Pick<VaultProject, 'id' | 'title'>,
): VaultProject {
  return {
    created: '2026-07-01',
    description: 'Test project',
    okr: 'Ship it',
    path: `01-projects/${overrides.id}.md`,
    status: 'active',
    taskCount: 0,
    updatedAt: '2026-07-05T12:00:00.000Z',
    ...overrides,
  };
}

function createTask(
  overrides: Partial<VaultTask> & Pick<VaultTask, 'id' | 'status'>,
): VaultTask {
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
