import { describe, expect, it } from 'vitest';

import type { VaultTask } from '../../server/vault-fs';

import { readTaskPr } from './task-pr';

describe('readTaskPr', () => {
  it('reads pr_number and pr_url from task metadata', () => {
    const pr = readTaskPr(createTask({
      metadata: {
        pr_number: 42,
        pr_url: 'https://github.com/acme/app/pull/42',
      },
    }));

    expect(pr).toEqual({
      prNumber: 42,
      prUrl: 'https://github.com/acme/app/pull/42',
    });
  });

  it('supports camelCase keys and missing url', () => {
    const pr = readTaskPr(createTask({ metadata: { prNumber: 7 } }));

    expect(pr).toEqual({ prNumber: 7, prUrl: null });
  });

  it('returns null without a valid positive integer PR number', () => {
    expect(readTaskPr(createTask({ metadata: {} }))).toBeNull();
    expect(readTaskPr(createTask({ metadata: { pr_number: 0 } }))).toBeNull();
    expect(readTaskPr(createTask({ metadata: { pr_number: '42' } }))).toBeNull();
  });
});

function createTask(overrides: Partial<VaultTask>): VaultTask {
  return {
    assignee: 'developer',
    body: '',
    created: '2026-07-01',
    dependsOn: [],
    effort: null,
    flagged: false,
    folderStatus: null,
    frontmatterStatus: 'merge-ready',
    id: 'T-001',
    labels: [],
    metadata: {},
    path: '02-tasks/merge-ready/T-001.md',
    priority: 'P2',
    projectId: null,
    spec: null,
    status: 'merge-ready',
    title: 'Task T-001',
    updatedAt: '2026-07-05T12:00:00.000Z',
    ...overrides,
  };
}
