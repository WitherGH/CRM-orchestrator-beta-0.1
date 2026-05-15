import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type {
  AgentRun,
  DailyCost,
  OrchestratorEvent,
} from '@crm-orchestrator/db/schema';

import type { AdminDataStore } from './admin-data';
import {
  AdminOrchestratorError,
  type AdminMutationResult,
  type AdminOrchestratorClient,
  type AgentKillInput,
  type AgentPauseInput,
  type CostCapSetInput,
  type CreateHumanRequestInput,
  type InboxTriageInput,
  type PrMergeInput,
  type TaskReprioritizeInput,
} from './admin-orchestrator';
import { adminRouter } from './admin';
import { createCallerFactory, type AdminVaultReader, type TRPCContext } from './init';
import {
  VaultFsError,
  type TaskStatus,
  type VaultFileSummary,
  type VaultMarkdownFile,
  type VaultTask,
  type VaultTreeNode,
} from '../vault-fs';

const createCaller = createCallerFactory(adminRouter);

describe('adminRouter procedures', () => {
  it('requires an authenticated admin user', async () => {
    await expect(createCaller(createContext({ user: null })).taskList()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    await expect(
      createCaller(
        createContext({
          user: {
            id: 'non-admin',
            isAdmin: false,
          },
        }),
      ).taskList(),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('requires admin access for mutations', async () => {
    await expect(
      createCaller(createContext({ user: null })).taskReprioritize({
        id: 'T-008',
        priority: 'P1',
      }),
    ).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    await expect(
      createCaller(
        createContext({
          user: {
            id: 'non-admin',
            isAdmin: false,
          },
        }),
      ).taskReprioritize({
        id: 'T-008',
        priority: 'P1',
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('lists vault tasks with an optional status filter', async () => {
    let seenStatus: TaskStatus | undefined;
    const task = createTask({
      id: 'T-007',
      status: 'in-progress',
      title: 'tRPC adminRouter read procedures',
    });
    const caller = createCaller(
      createContext({
        vaultFs: {
          ...createVaultReader(),
          listTasks: async (status) => {
            seenStatus = status;
            return [task];
          },
        },
      }),
    );

    const result = await caller.taskList({ status: 'in-progress' });

    expect(seenStatus).toBe('in-progress');
    expect(result).toEqual([task]);
  });

  it('reads a single task and maps missing tasks to NOT_FOUND', async () => {
    const task = createTask({ id: 'T-123', title: 'Detail task' });
    const foundCaller = createCaller(
      createContext({
        vaultFs: {
          ...createVaultReader(),
          readTask: async () => task,
        },
      }),
    );
    const missingCaller = createCaller(
      createContext({
        vaultFs: {
          ...createVaultReader(),
          readTask: async () => {
            throw new VaultFsError('NOT_FOUND', 'Task not found: T-999');
          },
        },
      }),
    );

    await expect(foundCaller.taskDetail({ id: 'T-123' })).resolves.toEqual(task);
    await expect(missingCaller.taskDetail({ id: 'T-999' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('reads recent agent runs and validates the limit', async () => {
    let seenLimit = 0;
    const run = createAgentRun({ taskId: 'T-007' });
    const caller = createCaller(
      createContext({
        adminDataStore: {
          ...createAdminDataStore(),
          listRecentRuns: async ({ limit }) => {
            seenLimit = limit;
            return [run];
          },
        },
      }),
    );

    await expect(caller.recentRuns({ limit: 1 })).resolves.toEqual([run]);
    expect(seenLimit).toBe(1);
    await expect(caller.recentRuns({ limit: 101 })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('defaults recent run limit to 50', async () => {
    let seenLimit = 0;
    const caller = createCaller(
      createContext({
        adminDataStore: {
          ...createAdminDataStore(),
          listRecentRuns: async ({ limit }) => {
            seenLimit = limit;
            return [];
          },
        },
      }),
    );

    await expect(caller.recentRuns()).resolves.toEqual([]);
    expect(seenLimit).toBe(50);
  });

  it('reads recent orchestrator events and validates the limit', async () => {
    let seenLimit = 0;
    const event = createOrchestratorEvent({
      payload: {
        agentRole: 'developer',
        model: 'gpt-5.5',
      },
      taskId: 'T-016',
      type: 'agent.started',
    });
    const caller = createCaller(
      createContext({
        adminDataStore: {
          ...createAdminDataStore(),
          listRecentEvents: async ({ limit }) => {
            seenLimit = limit;
            return [event];
          },
        },
      }),
    );

    await expect(caller.recentEvents({ limit: 1 })).resolves.toEqual([event]);
    expect(seenLimit).toBe(1);
    await expect(caller.recentEvents({ limit: 201 })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('defaults recent event limit to 100', async () => {
    let seenLimit = 0;
    const caller = createCaller(
      createContext({
        adminDataStore: {
          ...createAdminDataStore(),
          listRecentEvents: async ({ limit }) => {
            seenLimit = limit;
            return [];
          },
        },
      }),
    );

    await expect(caller.recentEvents()).resolves.toEqual([]);
    expect(seenLimit).toBe(100);
  });

  it('reads daily cost rows from the admin data store', async () => {
    const cost = createDailyCost({ agentRole: 'developer' });
    const caller = createCaller(
      createContext({
        adminDataStore: {
          ...createAdminDataStore(),
          listDailyCost: async () => [cost],
        },
      }),
    );

    await expect(caller.dailyCost()).resolves.toEqual([cost]);
  });

  it('lists inbox markdown summaries and the vault tree', async () => {
    const inboxItem = createVaultFileSummary({
      name: 'new-idea.md',
      path: '00-inbox/new-idea.md',
    });
    const tree = [
      {
        children: [
          {
            name: 'F-001-multi-agent-crm.md',
            path: '05-features/F-001-multi-agent-crm.md',
            type: 'file',
            updatedAt: '2026-05-14T10:00:00.000Z',
          },
        ],
        name: '05-features',
        path: '05-features',
        type: 'directory',
      },
    ] satisfies VaultTreeNode[];
    let seenTreePath: string | undefined;
    const caller = createCaller(
      createContext({
        vaultFs: {
          ...createVaultReader(),
          listInbox: async () => [inboxItem],
          listVaultTree: async (path) => {
            seenTreePath = path;
            return tree;
          },
        },
      }),
    );

    await expect(caller.inboxList()).resolves.toEqual([inboxItem]);
    await expect(caller.vaultTree({ path: '05-features' })).resolves.toEqual(tree);
    expect(seenTreePath).toBe('05-features');
  });

  it('reads live agent state from vault tasks', async () => {
    const task = createTask({
      assignee: 'developer',
      id: 'T-777',
      status: 'in-progress',
      title: 'Live rail task',
    });
    const caller = createCaller(
      createContext({
        vaultFs: {
          ...createVaultReader(),
          listTasks: async () => [task],
        },
      }),
    );

    const result = await caller.liveAgentState();

    expect(result.activeCount).toBe(1);
    expect(result.pollIntervalMs).toBe(5_000);
    expect(result.agents.find((agent) => agent.role === 'developer')).toMatchObject({
      lastOutput: 'Working on Live rail task.',
      model: 'gpt-5.5',
      roleLabel: 'Developer',
      status: 'running',
      taskId: 'T-777',
    });
  });

  it('reads PR queue rows from vault tasks and recent runs', async () => {
    let seenLimit = 0;
    const task = createTask({
      id: 'T-013',
      metadata: {
        ciStatus: 'success',
        githubUrl: 'https://github.com/example/crm-orchestrator-beta-0.1/pull/13',
        reviewerStatus: 'approved',
      },
      status: 'review',
      title: 'PR queue panel',
    });
    const run = createAgentRun({
      prNumber: 13,
      taskId: 'T-013',
    });
    const caller = createCaller(
      createContext({
        adminDataStore: {
          ...createAdminDataStore(),
          listRecentRuns: async ({ limit }) => {
            seenLimit = limit;
            return [run];
          },
        },
        vaultFs: {
          ...createVaultReader(),
          listTasks: async () => [task],
        },
      }),
    );

    const result = await caller.prQueue({ limit: 25 });

    expect(seenLimit).toBe(25);
    expect(result).toEqual([
      expect.objectContaining({
        ciStatus: 'green',
        githubUrl: 'https://github.com/example/crm-orchestrator-beta-0.1/pull/13',
        mergeEnabled: true,
        prNumber: 13,
        reviewerStatus: 'approved',
        taskId: 'T-013',
        title: 'PR queue panel',
      }),
    ]);
  });

  it('reads vault markdown and maps invalid vault paths to BAD_REQUEST', async () => {
    const file = createVaultMarkdownFile({
      path: '05-features/F-001-multi-agent-crm.md',
    });
    const foundCaller = createCaller(
      createContext({
        vaultFs: {
          ...createVaultReader(),
          read: async () => file,
        },
      }),
    );
    const invalidCaller = createCaller(
      createContext({
        vaultFs: {
          ...createVaultReader(),
          read: async () => {
            throw new VaultFsError('OUTSIDE_VAULT', 'Vault path escapes the vault root');
          },
        },
      }),
    );

    await expect(
      foundCaller.vaultRead({ path: '05-features/F-001-multi-agent-crm.md' }),
    ).resolves.toEqual(file);
    await expect(invalidCaller.vaultRead({ path: '../outside.md' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('proxies task reprioritization to the orchestrator with the admin actor', async () => {
    const result = createMutationResult({
      message: 'Task priority updated',
      requestId: 'req-task',
    });
    let seenInput: TaskReprioritizeInput | null = null;
    const caller = createCaller(
      createContext({
        orchestrator: createOrchestratorClient({
          taskReprioritize: async (input) => {
            seenInput = input;
            return result;
          },
        }),
      }),
    );

    await expect(caller.taskReprioritize({ id: 'T-008', priority: 'P1' })).resolves.toEqual(result);
    expect(seenInput).toEqual({
      actorUserId: 'local-admin',
      id: 'T-008',
      priority: 'P1',
    });
  });

  it('proxies inbox triage and agent control mutations', async () => {
    const calls: Array<{ input: unknown; name: string }> = [];
    const runId = randomUUID();
    const caller = createCaller(
      createContext({
        orchestrator: createOrchestratorClient({
          agentKill: async (input) => {
            calls.push({ input, name: 'agentKill' });
            return createMutationResult();
          },
          agentPause: async (input) => {
            calls.push({ input, name: 'agentPause' });
            return createMutationResult();
          },
          inboxTriage: async (input) => {
            calls.push({ input, name: 'inboxTriage' });
            return createMutationResult();
          },
        }),
      }),
    );

    await expect(caller.inboxTriage({ action: 'to-pm', filename: 'idea.md' })).resolves.toEqual({
      ok: true,
    });
    await expect(caller.agentKill({ runId })).resolves.toEqual({ ok: true });
    await expect(caller.agentPause({ role: 'developer' })).resolves.toEqual({ ok: true });

    expect(calls).toEqual([
      {
        input: {
          action: 'to-pm',
          actorUserId: 'local-admin',
          filename: 'idea.md',
        } satisfies InboxTriageInput,
        name: 'inboxTriage',
      },
      {
        input: {
          actorUserId: 'local-admin',
          runId,
        } satisfies AgentKillInput,
        name: 'agentKill',
      },
      {
        input: {
          actorUserId: 'local-admin',
          role: 'developer',
        } satisfies AgentPauseInput,
        name: 'agentPause',
      },
    ]);
  });

  it('proxies cost cap and PR merge mutations', async () => {
    const calls: Array<{ input: unknown; name: string }> = [];
    const caller = createCaller(
      createContext({
        orchestrator: createOrchestratorClient({
          costCapSet: async (input) => {
            calls.push({ input, name: 'costCapSet' });
            return createMutationResult({ requestId: 'req-cost' });
          },
          prMerge: async (input) => {
            calls.push({ input, name: 'prMerge' });
            return createMutationResult({ requestId: 'req-pr' });
          },
          prMergeReady: async (input) => {
            calls.push({ input, name: 'prMergeReady' });
            return createMutationResult({ requestId: 'merge-ready-reviewer' });
          },
        }),
      }),
    );

    await expect(caller.costCapSet({ usd: 42.5 })).resolves.toEqual({
      ok: true,
      requestId: 'req-cost',
    });
    await expect(caller.prMerge({ prNumber: 142 })).resolves.toEqual({
      ok: true,
      requestId: 'req-pr',
    });
    await expect(caller.prMergeReady()).resolves.toEqual({
      ok: true,
      requestId: 'merge-ready-reviewer',
    });

    expect(calls).toEqual([
      {
        input: {
          actorUserId: 'local-admin',
          usd: 42.5,
        } satisfies CostCapSetInput,
        name: 'costCapSet',
      },
      {
        input: {
          actorUserId: 'local-admin',
          prNumber: 142,
        } satisfies PrMergeInput,
        name: 'prMerge',
      },
      {
        input: {
          actorUserId: 'local-admin',
        },
        name: 'prMergeReady',
      },
    ]);
  });

  it('proxies human request intake with model overrides to the orchestrator', async () => {
    let seenInput: CreateHumanRequestInput | null = null;
    const caller = createCaller(
      createContext({
        orchestrator: createOrchestratorClient({
          createHumanRequest: async (input) => {
            seenInput = input;
            return createMutationResult({
              requestId: 'R-20260514T120000-request',
              taskIds: ['T-019', 'T-020'],
            });
          },
        }),
      }),
    );

    await expect(
      caller.createHumanRequest({
        brief: 'Build a request intake composer for the admin console.',
        humanNotes: 'Keep each role output reviewable.',
        labels: ['crm'],
        priority: 'P0',
        roles: [
          { enabled: true, model: 'opus', role: 'architect' },
          { enabled: true, model: 'gpt-5.4', role: 'developer' },
        ],
        targetArea: 'apps/web',
        title: 'Request intake composer',
      }),
    ).resolves.toEqual({
      ok: true,
      requestId: 'R-20260514T120000-request',
      taskIds: ['T-019', 'T-020'],
    });

    expect(seenInput).toEqual({
      actorUserId: 'local-admin',
      brief: 'Build a request intake composer for the admin console.',
      humanNotes: 'Keep each role output reviewable.',
      labels: ['crm'],
      priority: 'P0',
      projectId: null,
      roles: [
        { enabled: true, model: 'opus', role: 'architect' },
        { enabled: true, model: 'gpt-5.4', role: 'developer' },
      ],
      targetArea: 'apps/web',
      title: 'Request intake composer',
    });
  });

  it('validates mutation inputs before invoking the orchestrator', async () => {
    let calls = 0;
    const caller = createCaller(
      createContext({
        orchestrator: createOrchestratorClient({
          costCapSet: async () => {
            calls += 1;
            return createMutationResult();
          },
          createHumanRequest: async () => {
            calls += 1;
            return createMutationResult();
          },
          inboxTriage: async () => {
            calls += 1;
            return createMutationResult();
          },
          prMerge: async () => {
            calls += 1;
            return createMutationResult();
          },
          taskReprioritize: async () => {
            calls += 1;
            return createMutationResult();
          },
        }),
      }),
    );
    const invalidPriorityInput = { id: 'T-008', priority: 'PX' } as unknown as Parameters<
      typeof caller.taskReprioritize
    >[0];

    await expect(caller.taskReprioritize({ id: 'task-008', priority: 'P1' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    await expect(caller.taskReprioritize(invalidPriorityInput)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    await expect(caller.inboxTriage({ action: 'archive', filename: '../idea.md' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    await expect(caller.costCapSet({ usd: -1 })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    await expect(caller.prMerge({ prNumber: 0 })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    await expect(
      caller.createHumanRequest({
        brief: 'too short',
        humanNotes: null,
        labels: ['Bad Label'],
        priority: 'P0',
        roles: [
          { enabled: false, model: 'gpt-5.5', role: 'developer' },
        ],
        targetArea: null,
        title: 'No',
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(calls).toBe(0);
  });

  it('maps orchestrator mutation errors to tRPC errors', async () => {
    const caller = createCaller(
      createContext({
        orchestrator: createOrchestratorClient({
          agentKill: async () => {
            throw new AdminOrchestratorError('NOT_FOUND', 'Agent run not found');
          },
          costCapSet: async () => {
            throw new AdminOrchestratorError('UNAVAILABLE', 'Orchestrator unavailable');
          },
          prMerge: async () => {
            throw new AdminOrchestratorError('CONFLICT', 'PR is not mergeable');
          },
          taskReprioritize: async () => {
            throw new AdminOrchestratorError('BAD_REQUEST', 'Cannot reprioritize task');
          },
        }),
      }),
    );

    await expect(caller.agentKill({ runId: randomUUID() })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Agent run not found',
    });
    await expect(caller.prMerge({ prNumber: 142 })).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'PR is not mergeable',
    });
    await expect(caller.taskReprioritize({ id: 'T-008', priority: 'P0' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Cannot reprioritize task',
    });
    await expect(caller.costCapSet({ usd: 50 })).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Orchestrator unavailable',
    });
  });
});

function createContext(overrides: Partial<TRPCContext> = {}): TRPCContext {
  return {
    adminDataStore: createAdminDataStore(),
    orchestrator: createOrchestratorClient(),
    user: {
      id: 'local-admin',
      isAdmin: true,
    },
    vaultFs: createVaultReader(),
    ...overrides,
  };
}

function createOrchestratorClient(
  overrides: Partial<AdminOrchestratorClient> = {},
): AdminOrchestratorClient {
  return {
    agentKill: async () => createMutationResult(),
    agentModelSet: async () => createMutationResult(),
    agentPause: async () => createMutationResult(),
    automationStart: async () => createMutationResult(),
    automationStop: async () => createMutationResult(),
    costCapSet: async () => createMutationResult(),
    createHumanRequest: async () => createMutationResult(),
    inboxTriage: async () => createMutationResult(),
    prMerge: async () => createMutationResult(),
    prMergeReady: async () => createMutationResult(),
    taskDelete: async () => createMutationResult(),
    taskKill: async () => createMutationResult(),
    taskReprioritize: async () => createMutationResult(),
    taskStatusSet: async () => createMutationResult(),
    taskUpdate: async () => createMutationResult(),
    tickRun: async () => createMutationResult(),
    ...overrides,
  };
}

function createMutationResult(
  overrides: Partial<AdminMutationResult> = {},
): AdminMutationResult {
  return {
    ok: true,
    ...overrides,
  };
}

function createAdminDataStore(): AdminDataStore {
  return {
    listDailyCost: async () => [],
    listRecentEvents: async () => [],
    listRecentRuns: async () => [],
  };
}

function createVaultReader(): AdminVaultReader {
  return {
    listInbox: async () => [],
    listTasks: async () => [],
    listVaultTree: async () => [],
    read: async () => createVaultMarkdownFile(),
    readTask: async () => createTask(),
  };
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
    id: 'T-001',
    labels: ['crm'],
    metadata: {},
    path: '04-tasks/in-progress/T-001-test.md',
    priority: 'P0',
    projectId: null,
    spec: 'F-001',
    status: 'in-progress',
    title: 'Test task',
    updatedAt: '2026-05-14T10:00:00.000Z',
    ...overrides,
  };
}

function createVaultMarkdownFile(
  overrides: Partial<VaultMarkdownFile> = {},
): VaultMarkdownFile {
  return {
    area: 'vault',
    body: '\n# Feature',
    content: '---\ntitle: Feature\n---\n\n# Feature',
    frontmatter: {
      title: 'Feature',
    },
    name: 'F-001-multi-agent-crm.md',
    path: '05-features/F-001-multi-agent-crm.md',
    sizeBytes: 36,
    updatedAt: '2026-05-14T10:00:00.000Z',
    ...overrides,
  };
}

function createVaultFileSummary(
  overrides: Partial<VaultFileSummary> = {},
): VaultFileSummary {
  return {
    area: 'inbox',
    name: 'idea.md',
    path: '00-inbox/idea.md',
    sizeBytes: 42,
    updatedAt: '2026-05-14T10:00:00.000Z',
    ...overrides,
  };
}

function createAgentRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    agentRole: 'developer',
    branch: 'agent/developer/T-007-trpc-adminrouter-read-procedures',
    costUsd: 0.5,
    exitCode: null,
    finishedAt: null,
    id: randomUUID(),
    metadata: {},
    model: 'gpt-5.5',
    prNumber: 7,
    startedAt: new Date('2026-05-14T10:00:00.000Z'),
    status: 'running',
    stderrPath: '/tmp/T-007.stderr.log',
    stdoutPath: '/tmp/T-007.stdout.log',
    taskId: 'T-007',
    tokensInput: 1_000,
    tokensOutput: 500,
    worktreePath: '/worktrees/T-007',
    ...overrides,
  };
}

function createDailyCost(overrides: Partial<DailyCost> = {}): DailyCost {
  return {
    agentRole: 'developer',
    costUsd: 14.23,
    date: new Date('2026-05-14T00:00:00.000Z'),
    tasksCompleted: 2,
    ...overrides,
  };
}

function createOrchestratorEvent(
  overrides: Partial<OrchestratorEvent> = {},
): OrchestratorEvent {
  return {
    agentRunId: null,
    id: randomUUID(),
    payload: {},
    taskId: 'T-001',
    ts: new Date('2026-05-14T12:00:00.000Z'),
    type: 'tick.start',
    ...overrides,
  };
}
