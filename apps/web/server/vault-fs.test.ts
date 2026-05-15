import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ADMIN_VAULT_ROOM,
  VAULT_CHANGED_EVENT,
  VaultFsError,
  createVaultFsService,
  type VaultFsChangeEvent,
  type VaultSocketEmitter,
} from './vault-fs';

interface CapturedVaultEvent {
  room: string;
  event: string;
  payload: VaultFsChangeEvent;
}

describe('VaultFsService', () => {
  const tempVaults: string[] = [];

  afterEach(async () => {
    await Promise.all(tempVaults.map((path) => rm(path, { force: true, recursive: true })));
    tempVaults.length = 0;
  });

  it('lists tasks from vault markdown and uses the task folder as the effective status', async () => {
    const vaultRoot = await createTempVault(tempVaults);
    await writeVaultFile(
      vaultRoot,
      '04-tasks/in-progress/T-101-sample-task.md',
      taskMarkdown({
        id: 'T-101',
        title: 'Sample task',
        status: 'backlog',
        priority: 'P1',
        assignee: 'developer',
        extra: 'created_by: pm',
      }),
    );

    const service = createVaultFsService({ vaultRoot });

    const tasks = await service.listTasks('in-progress');

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      id: 'T-101',
      title: 'Sample task',
      status: 'in-progress',
      frontmatterStatus: 'backlog',
      folderStatus: 'in-progress',
      priority: 'P1',
      assignee: 'developer',
      metadata: { created_by: 'pm' },
    });
  });

  it('lists project-scoped task folders and project metadata', async () => {
    const vaultRoot = await createTempVault(tempVaults);
    await writeVaultFile(
      vaultRoot,
      '03-projects/crm-orchestrator.md',
      [
        '---',
        'id: crm-orchestrator',
        'title: CRM orchestrator',
        'status: active',
        'created: "2026-05-15"',
        '---',
        '',
        '## Description',
        'CRM workspace.',
        '',
        '## OKR',
        'Ship the first CRM orchestrator slice.',
      ].join('\n'),
    );
    await writeVaultFile(
      vaultRoot,
      '04-tasks/crm-orchestrator/backlog/T-121-project-task.md',
      taskMarkdown({
        id: 'T-121',
        title: 'Project task',
        status: 'review',
        priority: 'P1',
        assignee: 'architect',
      }),
    );

    const service = createVaultFsService({ vaultRoot });
    const [projects, tasks] = await Promise.all([
      service.listProjects(),
      service.listTasks('backlog', 'crm-orchestrator'),
    ]);

    expect(projects).toMatchObject([
      {
        id: 'crm-orchestrator',
        taskCount: 1,
        title: 'CRM orchestrator',
      },
    ]);
    expect(tasks).toMatchObject([
      {
        folderStatus: 'backlog',
        frontmatterStatus: 'review',
        projectId: 'crm-orchestrator',
        status: 'backlog',
      },
    ]);
  });

  it('refreshes task files between reads when the watcher is not running', async () => {
    const vaultRoot = await createTempVault(tempVaults);
    const service = createVaultFsService({ vaultRoot });

    await expect(service.listTasks()).resolves.toEqual([]);

    await writeVaultFile(
      vaultRoot,
      '04-tasks/backlog/T-111-external-task.md',
      taskMarkdown({
        id: 'T-111',
        title: 'External task',
        status: 'backlog',
        priority: 'P1',
        assignee: 'developer',
      }),
    );

    await expect(service.listTasks('backlog')).resolves.toMatchObject([
      {
        id: 'T-111',
        title: 'External task',
        status: 'backlog',
      },
    ]);
  });

  it('reads markdown inside the vault and rejects traversal outside it', async () => {
    const vaultRoot = await createTempVault(tempVaults);
    await writeVaultFile(
      vaultRoot,
      '05-features/F-001-multi-agent-crm.md',
      ['---', 'title: Feature', '---', '', '# Feature body'].join('\n'),
    );

    const service = createVaultFsService({ vaultRoot });

    const file = await service.read('05-features/F-001-multi-agent-crm.md');

    expect(file).toMatchObject({
      area: 'vault',
      body: '\n# Feature body',
      frontmatter: { title: 'Feature' },
      name: 'F-001-multi-agent-crm.md',
      path: '05-features/F-001-multi-agent-crm.md',
    });
    await expect(service.read('../outside.md')).rejects.toMatchObject({
      code: 'OUTSIDE_VAULT',
    } satisfies Partial<VaultFsError>);
  });

  it('caches inbox and progress markdown summaries', async () => {
    const vaultRoot = await createTempVault(tempVaults);
    await writeVaultFile(vaultRoot, '00-inbox/new-idea.md', '# Idea');
    await writeVaultFile(vaultRoot, '06-progress/2026-05-14.md', '# Progress');

    const service = createVaultFsService({ vaultRoot });

    await expect(service.listInbox()).resolves.toMatchObject([
      {
        area: 'inbox',
        name: 'new-idea.md',
        path: '00-inbox/new-idea.md',
      },
    ]);
    await expect(service.listProgress()).resolves.toMatchObject([
      {
        area: 'progress',
        name: '2026-05-14.md',
        path: '06-progress/2026-05-14.md',
      },
    ]);
  });

  it('builds a markdown-only vault tree', async () => {
    const vaultRoot = await createTempVault(tempVaults);
    await writeVaultFile(
      vaultRoot,
      '02-architecture/ADR-001-crm-orchestrator-architecture.md',
      '# Architecture',
    );
    await writeVaultFile(vaultRoot, '02-architecture/diagram.png', 'not markdown');
    await writeVaultFile(vaultRoot, '.obsidian/workspace.md', '# Hidden');

    const service = createVaultFsService({ vaultRoot });

    const tree = await service.listVaultTree();

    expect(tree).toMatchObject([
      {
        name: '02-architecture',
        path: '02-architecture',
        type: 'directory',
        children: [
          {
            name: 'ADR-001-crm-orchestrator-architecture.md',
            path: '02-architecture/ADR-001-crm-orchestrator-architecture.md',
            type: 'file',
          },
        ],
      },
    ]);
  });

  it('updates the cache and emits to admin:vault when watched task files change', async () => {
    const vaultRoot = await createTempVault(tempVaults);
    await mkdir(join(vaultRoot, '04-tasks/backlog'), { recursive: true });
    const captured = createCapturedEmitter();
    const service = createVaultFsService({
      io: captured.io,
      now: () => new Date('2026-05-14T09:30:00.000Z'),
      vaultRoot,
    });

    try {
      await service.start();
      await writeVaultFile(
        vaultRoot,
        '04-tasks/backlog/T-202-watch-me.md',
        taskMarkdown({
          id: 'T-202',
          title: 'Watch me',
          status: 'backlog',
          priority: 'P0',
          assignee: 'tester',
        }),
      );

      await waitFor(() => captured.events.some((event) => event.payload.taskId === 'T-202'), 10_000);
      const task = await service.readTask('T-202');

      expect(task.title).toBe('Watch me');
      expect(captured.events).toContainEqual({
        room: ADMIN_VAULT_ROOM,
        event: VAULT_CHANGED_EVENT,
        payload: expect.objectContaining({
          emittedAt: '2026-05-14T09:30:00.000Z',
          path: '04-tasks/backlog/T-202-watch-me.md',
          taskId: 'T-202',
          type: 'file.added',
        }),
      });
    } finally {
      await service.stop();
    }
  }, 10_000);

  it('removes deleted watched tasks from the cache and emits a removal event', async () => {
    const vaultRoot = await createTempVault(tempVaults);
    const taskPath = '04-tasks/backlog/T-303-delete-me.md';
    await writeVaultFile(
      vaultRoot,
      taskPath,
      taskMarkdown({
        id: 'T-303',
        title: 'Delete me',
        status: 'backlog',
        priority: 'P2',
        assignee: 'developer',
      }),
    );
    const captured = createCapturedEmitter();
    const service = createVaultFsService({ io: captured.io, vaultRoot });

    try {
      await service.start();
      await unlink(join(vaultRoot, taskPath));

      await waitFor(() => captured.events.some((event) => event.payload.type === 'file.removed'), 10_000);

      await expect(service.readTask('T-303')).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(captured.events).toContainEqual({
        room: ADMIN_VAULT_ROOM,
        event: VAULT_CHANGED_EVENT,
        payload: expect.objectContaining({
          path: taskPath,
          taskId: 'T-303',
          type: 'file.removed',
        }),
      });
    } finally {
      await service.stop();
    }
  }, 10_000);
});

async function createTempVault(paths: string[]): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'crm-vault-'));
  paths.push(path);
  return path;
}

async function writeVaultFile(vaultRoot: string, path: string, content: string): Promise<void> {
  const absolutePath = join(vaultRoot, path);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, 'utf-8');
}

function taskMarkdown(input: {
  id: string;
  title: string;
  status: string;
  priority: string;
  assignee: string;
  extra?: string;
}): string {
  return [
    '---',
    `id: ${input.id}`,
    `title: ${input.title}`,
    `status: ${input.status}`,
    `priority: ${input.priority}`,
    'effort: M',
    `assignee: ${input.assignee}`,
    'depends_on: []',
    'labels: [crm]',
    'created: "2026-05-14"',
    'flagged: false',
    input.extra ?? null,
    '---',
    '',
    '## What',
    'Implement the task.',
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
}

function createCapturedEmitter(): { io: VaultSocketEmitter; events: CapturedVaultEvent[] } {
  const events: CapturedVaultEvent[] = [];

  return {
    events,
    io: {
      to(room: string) {
        return {
          emit(event: string, payload: VaultFsChangeEvent): void {
            events.push({ event, payload, room });
          },
        };
      },
    },
  };
}

async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error('Timed out waiting for condition');
}
