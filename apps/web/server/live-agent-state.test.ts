import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  defaultWorktreeBase,
  readLiveAgentLog,
  readLiveAgentSnapshot,
} from './live-agent-state';
import type { VaultTask } from './vault-fs';

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { force: true, recursive: true })));
  tempRoots.length = 0;
});

describe('readLiveAgentSnapshot', () => {
  it('renders running tasks with model metadata and the latest useful log line', async () => {
    const worktreeBase = await createTempRoot();
    await mkdir(join(worktreeBase, 'T-012'), { recursive: true });
    await writeFile(
      join(worktreeBase, 'T-012', '.orchestrator-live.log'),
      [
        '[agent] T-012 developer via codex:gpt-5.5 started at 2026-05-14T10:00:00.000Z',
        'Reading apps/web/components/admin-orchestrator-shell/admin-orchestrator-shell.tsx',
        '2026-05-14T10:01:00.000Z  WARN codex_core_plugins::manifest: ignored',
        'Adding focused tests for the right rail.',
      ].join('\n'),
      'utf-8',
    );

    const snapshot = await readLiveAgentSnapshot({
      now: () => new Date('2026-05-14T10:14:23.000Z'),
      tasks: [
        createTask({
          assignee: 'developer',
          id: 'T-012',
          status: 'in-progress',
          title: 'Live agent state right rail',
          updatedAt: '2026-05-14T10:00:05.000Z',
        }),
      ],
      worktreeBase,
    });

    const developer = snapshot.agents.find((agent) => agent.role === 'developer');

    expect(snapshot.activeCount).toBe(1);
    expect(snapshot.totalRoles).toBe(6);
    expect(developer).toMatchObject({
      actions: {
        fullLogEnabled: true,
        killEnabled: true,
        pauseEnabled: false,
      },
      elapsedLabel: '14m 23s elapsed',
      fullLogHref: '/api/admin/orchestrator/live-agents/log?taskId=T-012',
      lastOutput: 'Adding focused tests for the right rail.',
      model: 'gpt-5.5',
      roleLabel: 'Developer',
      runner: 'codex',
      status: 'running',
      taskId: 'T-012',
      taskTitle: 'Live agent state right rail',
    });
  });

  it('marks finished in-progress tasks as stale when a final stdout log exists', async () => {
    const worktreeBase = await createTempRoot();
    await mkdir(join(worktreeBase, 'T-013'), { recursive: true });
    await writeFile(
      join(worktreeBase, 'T-013', '.orchestrator-live.log'),
      '[agent] T-013 architect via claude:opus started at 2026-05-14T10:00:00.000Z\nFinished architecture note.',
      'utf-8',
    );
    await writeFile(
      join(worktreeBase, 'T-013', '.orchestrator-stdout.log'),
      'STDOUT:\nFinished architecture note.',
      'utf-8',
    );

    const snapshot = await readLiveAgentSnapshot({
      now: () => new Date('2026-05-14T10:20:00.000Z'),
      tasks: [
        createTask({
          assignee: 'architect',
          id: 'T-013',
          status: 'in-progress',
          title: 'Finished but stale architecture task',
          updatedAt: '2026-05-14T10:00:05.000Z',
        }),
      ],
      worktreeBase,
    });

    const architect = snapshot.agents.find((agent) => agent.role === 'architect');

    expect(snapshot.activeCount).toBe(0);
    expect(architect).toMatchObject({
      lastOutput: 'Finished architecture note.',
      status: 'stale',
      taskId: 'T-013',
    });
  });

  it('fills idle placeholders from the latest task assigned to each role', async () => {
    const snapshot = await readLiveAgentSnapshot({
      now: () => new Date('2026-05-14T11:00:00.000Z'),
      tasks: [
        createTask({
          assignee: 'reviewer',
          id: 'T-001',
          status: 'done',
          title: 'Audit existing code',
          updatedAt: '2026-05-14T10:37:00.000Z',
        }),
      ],
      worktreeBase: await createTempRoot(),
    });

    const reviewer = snapshot.agents.find((agent) => agent.role === 'reviewer');

    expect(snapshot.activeCount).toBe(0);
    expect(reviewer).toMatchObject({
      elapsedLabel: 'last seen 23m ago',
      fullLogHref: null,
      lastOutput: 'Idle. Last task T-001: Audit existing code.',
      status: 'idle',
      taskId: null,
    });
  });
});

describe('readLiveAgentLog', () => {
  it('returns the full live log content for a task worktree', async () => {
    const worktreeBase = await createTempRoot();
    await mkdir(join(worktreeBase, 'T-012'), { recursive: true });
    await writeFile(
      join(worktreeBase, 'T-012', '.orchestrator-live.log'),
      '[agent] T-012 developer via codex:gpt-5.5 started at 2026-05-14T10:00:00.000Z\nFull log line.',
      'utf-8',
    );

    const log = await readLiveAgentLog('T-012', worktreeBase);

    expect(log?.content).toContain('Full log line.');
    expect(log?.logPath).toBe(join(worktreeBase, 'T-012', '.orchestrator-live.log'));
  });
});

describe('defaultWorktreeBase', () => {
  it('uses the parent directory when running inside a task worktree', () => {
    expect(defaultWorktreeBase('/repo/worktrees/T-012')).toBe('/repo/worktrees');
  });

  it('walks upward when running from an app package inside a task worktree', () => {
    expect(defaultWorktreeBase('/repo/worktrees/T-012/apps/web')).toBe('/repo/worktrees');
  });
});

async function createTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'crm-live-agent-state-'));
  tempRoots.push(root);
  return root;
}

function createTask(overrides: Partial<VaultTask> = {}): VaultTask {
  return {
    assignee: 'developer',
    body: '\n## What\nImplement the task.',
    created: '2026-05-14',
    dependsOn: [],
    effort: 'M',
    flagged: false,
    folderStatus: 'in-progress',
    frontmatterStatus: 'in-progress',
    id: 'T-012',
    labels: ['crm'],
    metadata: {},
    path: '04-tasks/in-progress/T-012-live-agent-state-right-rail.md',
    priority: 'P0',
    projectId: null,
    spec: 'F-001',
    status: 'in-progress',
    title: 'Live agent state right rail',
    updatedAt: '2026-05-14T10:00:00.000Z',
    ...overrides,
  };
}
