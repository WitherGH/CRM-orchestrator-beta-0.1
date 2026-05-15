import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { LiveAgentSnapshot } from '../../server/live-agent-state';
import type { VaultTask } from '../../server/vault-fs';

import {
  TaskDetailDrawer,
  buildTaskArtifacts,
  buildTaskDetailViewModel,
  buildTaskLogLines,
  readTaskPrLink,
} from './task-detail-drawer';

describe('TaskDetailDrawer', () => {
  it('renders task metadata, recent log output, PR link, and markdown content', () => {
    const task = createTask({
      body: '\n## What\nImplement the drawer.\n\n- Show full task content.',
      metadata: {
        artifact_files: [
          {
            kind: 'stdout_log',
            label: 'stdout log',
            path: 'worktrees/T-011/.orchestrator-stdout.log',
          },
        ],
        changed_files: ['apps/web/components/task-detail-drawer/task-detail-drawer.tsx'],
        created_files: ['apps/web/components/task-detail-drawer/task-detail-drawer.test.ts'],
        pr_url: 'https://github.com/WitherGH/crm-orchestrator-beta-0.1/pull/42',
      },
    });
    const html = renderToStaticMarkup(
      createElement(TaskDetailDrawer, {
        isOpen: true,
        liveAgentSnapshot: createLiveAgentSnapshot(),
        onClose: () => undefined,
        task,
      }),
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('Task detail');
    expect(html).toContain('T-011');
    expect(html).toContain('Task detail drawer');
    expect(html).toContain('In progress');
    expect(html).toContain('Developer');
    expect(html).toContain('PR #42');
    expect(html).toContain('href="https://github.com/WitherGH/crm-orchestrator-beta-0.1/pull/42"');
    expect(html).toContain('Artifacts');
    expect(html).toContain('stdout log');
    expect(html).toContain('worktrees/T-011/.orchestrator-stdout.log');
    expect(html).toContain('Changed file');
    expect(html).toContain('apps/web/components/task-detail-drawer/task-detail-drawer.tsx');
    expect(html).toContain('Created file');
    expect(html).toContain('Adding the task drawer component.');
    expect(html).toContain('View full log');
    expect(html).toContain('Implement the drawer.');
    expect(html).toContain('Show full task content.');
  });

  it('renders no drawer when closed', () => {
    const html = renderToStaticMarkup(
      createElement(TaskDetailDrawer, {
        isOpen: false,
        onClose: () => undefined,
        task: createTask(),
      }),
    );

    expect(html).toBe('');
  });
});

describe('buildTaskDetailViewModel', () => {
  it('builds stable drawer labels from a vault task', () => {
    const model = buildTaskDetailViewModel(
      createTask({
        dependsOn: ['T-010', 'T-007'],
        effort: null,
        labels: ['crm', 'dashboard'],
        metadata: {
          pr_number: 42,
        },
        spec: 'F-001',
      }),
      {
        githubRepository: 'WitherGH/crm-orchestrator-beta-0.1',
        liveAgentSnapshot: createLiveAgentSnapshot(),
      },
    );

    expect(model).toMatchObject({
      assigneeLabel: 'Developer',
      createdLabel: '2026-05-14',
      dependsOn: ['T-010', 'T-007'],
      effortLabel: 'effort unset',
      labels: ['crm', 'dashboard'],
      specLabel: 'F-001',
      statusLabel: 'In progress',
      updatedLabel: '2026-05-14 12:00 UTC',
    });
    expect(model.prLink).toEqual({
      href: 'https://github.com/WitherGH/crm-orchestrator-beta-0.1/pull/42',
      label: 'PR #42',
    });
    expect(model.artifacts).toEqual([
      {
        detail: 'PR #42',
        href: 'https://github.com/WitherGH/crm-orchestrator-beta-0.1/pull/42',
        label: 'Pull request',
        tone: 'link',
      },
    ]);
    expect(model.logLines).toEqual([
      {
        href: '/api/admin/orchestrator/live-agents/log?taskId=T-011',
        label: 'Developer 4m elapsed',
        text: 'Adding the task drawer component.',
      },
    ]);
  });
});

describe('buildTaskLogLines', () => {
  it('returns only active log lines for the selected task', () => {
    expect(buildTaskLogLines('T-999', createLiveAgentSnapshot())).toEqual([]);
    expect(buildTaskLogLines('T-011', createLiveAgentSnapshot())).toHaveLength(1);
  });
});

describe('buildTaskArtifacts', () => {
  it('normalizes artifact links, files, changed files, and branch metadata', () => {
    expect(
      buildTaskArtifacts(
        {
          artifact_files: [
            {
              label: 'stdout log',
              path: 'worktrees/T-011/.orchestrator-stdout.log',
            },
          ],
          artifact_links: [
            {
              href: 'https://github.com/WitherGH/crm-orchestrator-beta-0.1/pull/42',
              label: 'PR #42',
            },
          ],
          branch: 'agent/developer/t-011-task-detail-drawer',
          changed_files: ['apps/web/components/task-detail-drawer/task-detail-drawer.tsx'],
          created_files: ['apps/web/components/task-detail-drawer/task-detail-drawer.test.ts'],
          deleted_files: ['apps/web/components/old-drawer.tsx'],
        },
        null,
      ),
    ).toEqual([
      {
        detail: 'https://github.com/WitherGH/crm-orchestrator-beta-0.1/pull/42',
        href: 'https://github.com/WitherGH/crm-orchestrator-beta-0.1/pull/42',
        label: 'PR #42',
        tone: 'link',
      },
      {
        detail: 'worktrees/T-011/.orchestrator-stdout.log',
        href: null,
        label: 'stdout log',
        tone: 'file',
      },
      {
        detail: 'apps/web/components/task-detail-drawer/task-detail-drawer.test.ts',
        href: null,
        label: 'Created file',
        tone: 'file',
      },
      {
        detail: 'apps/web/components/task-detail-drawer/task-detail-drawer.tsx',
        href: null,
        label: 'Changed file',
        tone: 'file',
      },
      {
        detail: 'apps/web/components/old-drawer.tsx',
        href: null,
        label: 'Deleted file',
        tone: 'file',
      },
      {
        detail: 'agent/developer/t-011-task-detail-drawer',
        href: null,
        label: 'Branch',
        tone: 'file',
      },
    ]);
  });
});

describe('readTaskPrLink', () => {
  it('uses a PR URL when task metadata has one', () => {
    expect(
      readTaskPrLink(
        {
          prUrl: 'https://github.com/WitherGH/crm-orchestrator-beta-0.1/pull/42',
        },
        null,
      ),
    ).toEqual({
      href: 'https://github.com/WitherGH/crm-orchestrator-beta-0.1/pull/42',
      label: 'PR #42',
    });
  });

  it('builds a GitHub URL from a PR number and repository', () => {
    expect(
      readTaskPrLink(
        {
          pr_number: '42',
        },
        'WitherGH/crm-orchestrator-beta-0.1',
      ),
    ).toEqual({
      href: 'https://github.com/WitherGH/crm-orchestrator-beta-0.1/pull/42',
      label: 'PR #42',
    });
  });

  it('returns an unlinked label when only a PR number is available', () => {
    expect(
      readTaskPrLink(
        {
          pr_number: 42,
        },
        null,
      ),
    ).toEqual({
      href: null,
      label: 'PR #42',
    });
  });
});

function createTask(overrides: Partial<VaultTask> = {}): VaultTask {
  return {
    assignee: 'developer',
    body: '\n## What\nImplement per spec.',
    created: '2026-05-14',
    dependsOn: [],
    effort: 'S',
    flagged: false,
    folderStatus: 'in-progress',
    frontmatterStatus: 'in-progress',
    id: 'T-011',
    labels: ['crm'],
    metadata: {},
    path: '04-tasks/in-progress/T-011-task-detail-drawer.md',
    priority: 'P1',
    projectId: null,
    spec: 'F-001',
    status: 'in-progress',
    title: 'Task detail drawer',
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
        elapsedLabel: '4m elapsed',
        fullLogHref: '/api/admin/orchestrator/live-agents/log?taskId=T-011',
        lastOutput: 'Adding the task drawer component.',
        logPath: '/worktrees/T-011/.orchestrator-live.log',
        model: 'gpt-5.5',
        role: 'developer',
        roleLabel: 'Developer',
        runner: 'codex',
        status: 'running',
        taskId: 'T-011',
        taskTitle: 'Task detail drawer',
        updatedAt: '2026-05-14T12:04:00.000Z',
      },
    ],
    pollIntervalMs: 5_000,
    refreshedAt: '2026-05-14T12:04:00.000Z',
    totalRoles: 6,
  };
}
