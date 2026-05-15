import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { AgentRun } from '@crm-orchestrator/db/schema';

import type { VaultTask } from './vault-fs';
import {
  buildPrQueueItems,
  formatPrAgeLabel,
} from './pr-queue';

describe('buildPrQueueItems', () => {
  it('builds mergeable PR rows from agent runs and sorts green approved PRs first', () => {
    const tasks = [
      createTask({
        id: 'T-013',
        status: 'merge-ready',
        title: 'PR queue panel',
      }),
      createTask({
        id: 'T-014',
        status: 'review',
        title: 'Inbox sidebar',
      }),
    ];
    const runs = [
      createAgentRun({
        metadata: {
          ciStatus: 'running',
          githubUrl: 'https://github.com/example/crm-orchestrator-beta-0.1/pull/44',
          reviewerStatus: 'pending',
        },
        prNumber: 44,
        startedAt: new Date('2026-05-14T11:00:00.000Z'),
        taskId: 'T-014',
      }),
      createAgentRun({
        metadata: {
          ci_status: 'success',
          github_url: 'https://github.com/example/crm-orchestrator-beta-0.1/pull/13',
          reviewer_status: 'approved',
        },
        prNumber: 13,
        startedAt: new Date('2026-05-14T12:00:00.000Z'),
        taskId: 'T-013',
      }),
    ];

    const items = buildPrQueueItems({ runs, tasks });

    expect(items.map((item) => item.prNumber)).toEqual([13, 44]);
    expect(items[0]).toMatchObject({
      assignee: 'developer',
      ciStatus: 'green',
      githubUrl: 'https://github.com/example/crm-orchestrator-beta-0.1/pull/13',
      mergeEnabled: true,
      reviewerStatus: 'approved',
      taskId: 'T-013',
      title: 'PR queue panel',
    });
    expect(items[1]).toMatchObject({
      ciStatus: 'yellow',
      mergeEnabled: false,
      reviewerStatus: 'pending',
    });
  });

  it('reads PR numbers from task metadata when the run index has not caught up', () => {
    const task = createTask({
      metadata: {
        ci: 'passing',
        pr_number: '72',
        pr_url: 'https://github.com/example/crm-orchestrator-beta-0.1/pull/72',
        review: 'approved',
      },
      status: 'review',
      title: 'Vault explorer',
      updatedAt: '2026-05-14T10:00:00.000Z',
    });

    const items = buildPrQueueItems({ tasks: [task] });

    expect(items).toEqual([
      expect.objectContaining({
        ciStatus: 'green',
        githubUrl: 'https://github.com/example/crm-orchestrator-beta-0.1/pull/72',
        mergeEnabled: true,
        openedAt: '2026-05-14T10:00:00.000Z',
        prNumber: 72,
        reviewerStatus: 'approved',
      }),
    ]);
  });

  it('excludes closed task states and keeps the latest run for duplicate PR numbers', () => {
    const tasks = [
      createTask({ id: 'T-010', status: 'done' }),
      createTask({ id: 'T-011', status: 'review' }),
    ];
    const runs = [
      createAgentRun({
        metadata: { ciStatus: 'red' },
        prNumber: 11,
        startedAt: new Date('2026-05-14T09:00:00.000Z'),
        taskId: 'T-011',
      }),
      createAgentRun({
        metadata: { ciStatus: 'green', reviewerStatus: 'approved' },
        prNumber: 11,
        startedAt: new Date('2026-05-14T10:00:00.000Z'),
        taskId: 'T-011',
      }),
      createAgentRun({
        prNumber: 10,
        taskId: 'T-010',
      }),
    ];

    const items = buildPrQueueItems({ runs, tasks });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      ciStatus: 'green',
      mergeEnabled: true,
      prNumber: 11,
    });
  });
});

describe('formatPrAgeLabel', () => {
  it('formats compact PR age labels', () => {
    const now = new Date('2026-05-14T12:30:00.000Z');

    expect(formatPrAgeLabel('2026-05-14T12:29:30.000Z', now)).toBe('now');
    expect(formatPrAgeLabel('2026-05-14T12:00:00.000Z', now)).toBe('30m');
    expect(formatPrAgeLabel('2026-05-14T10:30:00.000Z', now)).toBe('2h');
    expect(formatPrAgeLabel('2026-05-11T12:30:00.000Z', now)).toBe('3d');
    expect(formatPrAgeLabel('not-a-date', now)).toBe('unknown age');
  });
});

function createTask(overrides: Partial<VaultTask> = {}): VaultTask {
  const status = overrides.status ?? 'review';

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
    priority: 'P0',
    projectId: null,
    spec: 'F-001',
    status,
    title: 'Test task',
    updatedAt: '2026-05-14T09:30:00.000Z',
    ...overrides,
  };
}

function createAgentRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    agentRole: 'developer',
    branch: 'agent/developer/T-001-test',
    costUsd: 0.5,
    exitCode: 0,
    finishedAt: new Date('2026-05-14T09:40:00.000Z'),
    id: randomUUID(),
    metadata: {},
    model: 'gpt-5.5',
    prNumber: 1,
    startedAt: new Date('2026-05-14T09:30:00.000Z'),
    status: 'success',
    stderrPath: '/tmp/T-001.stderr.log',
    stdoutPath: '/tmp/T-001.stdout.log',
    taskId: 'T-001',
    tokensInput: 1_000,
    tokensOutput: 500,
    worktreePath: '/worktrees/T-001',
    ...overrides,
  };
}
