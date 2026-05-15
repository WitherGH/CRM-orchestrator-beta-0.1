import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type {
  AgentRun,
  DailyCost,
} from '@crm-orchestrator/db/schema';

import {
  buildAgentBoardData,
  type AgentBoardData,
} from './agent-board';
import type { LiveAgentSnapshot } from './live-agent-state';
import type { VaultTask } from './vault-fs';

describe('buildAgentBoardData', () => {
  it('summarizes all agent roles with queues, success rate, duration, and cost', () => {
    const data = createAgentBoardData();
    const developer = data.roles.find((role) => role.role === 'developer');

    expect(data.summary).toEqual({
      activeAgents: 1,
      averageSuccessRateLabel: '50% success',
      queuedTasks: 3,
      totalAgents: 6,
      weekCostLabel: '$3.00',
    });
    expect(developer).toMatchObject({
      activeTaskId: 'T-017',
      activeTaskTitle: 'Agent board modal and cost dashboard',
      averageCostPerTaskLabel: '$1.50 / task',
      averageTaskTimeLabel: '45m',
      costTodayLabel: '$2.00',
      costWeekLabel: '$3.00',
      model: 'gpt-5.5',
      queueCount: 3,
      runner: 'codex',
      status: 'running',
      successRateLabel: '50% success',
      successRatePercent: 50,
      tasksCompletedWeek: 2,
    });
    expect(developer?.queuePreview.map((task) => task.id)).toEqual(['T-017', 'T-020', 'T-018']);
  });

  it('uses explicit empty labels for roles without finished runs or completions', () => {
    const data = createAgentBoardData();
    const designer = data.roles.find((role) => role.role === 'designer');

    expect(designer).toMatchObject({
      activeTaskId: null,
      averageCostPerTaskLabel: 'no completions',
      averageTaskTimeLabel: 'no finished runs',
      costTodayLabel: '$0.00',
      queueCount: 0,
      roleLabel: 'Designer',
      status: 'idle',
      successRateLabel: 'no finished runs',
      successRatePercent: null,
    });
  });
});

function createAgentBoardData(): AgentBoardData {
  return buildAgentBoardData({
    dailyCosts: [
      createDailyCost({
        agentRole: 'developer',
        costUsd: 2,
        date: new Date('2026-05-14T00:00:00.000Z'),
        tasksCompleted: 1,
      }),
      createDailyCost({
        agentRole: 'developer',
        costUsd: 1,
        date: new Date('2026-05-13T00:00:00.000Z'),
        tasksCompleted: 1,
      }),
      createDailyCost({
        agentRole: 'developer',
        costUsd: 99,
        date: new Date('2026-05-01T00:00:00.000Z'),
        tasksCompleted: 10,
      }),
    ],
    liveAgentSnapshot: createLiveAgentSnapshot(),
    now: new Date('2026-05-14T12:00:00.000Z'),
    recentRuns: [
      createAgentRun({
        finishedAt: new Date('2026-05-14T10:30:00.000Z'),
        startedAt: new Date('2026-05-14T10:00:00.000Z'),
        status: 'success',
      }),
      createAgentRun({
        finishedAt: new Date('2026-05-13T11:00:00.000Z'),
        startedAt: new Date('2026-05-13T10:00:00.000Z'),
        status: 'failed',
      }),
      createAgentRun({
        finishedAt: new Date('2026-05-01T11:00:00.000Z'),
        startedAt: new Date('2026-05-01T10:00:00.000Z'),
        status: 'success',
      }),
    ],
    tasks: [
      createTask({
        id: 'T-018',
        priority: 'P0',
        status: 'backlog',
        title: 'Human request intake',
        updatedAt: '2026-05-14T11:00:00.000Z',
      }),
      createTask({
        id: 'T-017',
        priority: 'P1',
        status: 'in-progress',
        title: 'Agent board modal and cost dashboard',
        updatedAt: '2026-05-14T11:30:00.000Z',
      }),
      createTask({
        id: 'T-020',
        priority: 'P0',
        status: 'review',
        title: 'Review queue polish',
        updatedAt: '2026-05-14T10:00:00.000Z',
      }),
      createTask({
        id: 'T-001',
        status: 'done',
        title: 'Already done',
      }),
    ],
  });
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
        elapsedLabel: '12m elapsed',
        fullLogHref: '/api/admin/orchestrator/live-agents/log?taskId=T-017',
        lastOutput: 'Implementing metrics.',
        logPath: '/worktrees/T-017/.orchestrator-live.log',
        model: 'gpt-5.5',
        role: 'developer',
        roleLabel: 'Developer',
        runner: 'codex',
        status: 'running',
        taskId: 'T-017',
        taskTitle: 'Agent board modal and cost dashboard',
        updatedAt: '2026-05-14T11:45:00.000Z',
      },
    ],
    pollIntervalMs: 5_000,
    refreshedAt: '2026-05-14T12:00:00.000Z',
    totalRoles: 6,
  };
}

function createAgentRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    agentRole: 'developer',
    branch: 'agent/developer/T-017-agent-board-modal-cost-dashboard',
    costUsd: 0.5,
    exitCode: 0,
    finishedAt: new Date('2026-05-14T10:30:00.000Z'),
    id: randomUUID(),
    metadata: {},
    model: 'gpt-5.5',
    prNumber: null,
    startedAt: new Date('2026-05-14T10:00:00.000Z'),
    status: 'success',
    stderrPath: '/tmp/T-017.err',
    stdoutPath: '/tmp/T-017.out',
    taskId: 'T-017',
    tokensInput: 1000,
    tokensOutput: 500,
    worktreePath: '/worktrees/T-017',
    ...overrides,
  };
}

function createDailyCost(overrides: Partial<DailyCost> = {}): DailyCost {
  return {
    agentRole: 'developer',
    costUsd: 1,
    date: new Date('2026-05-14T00:00:00.000Z'),
    tasksCompleted: 1,
    ...overrides,
  };
}

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
    id: 'T-017',
    labels: ['crm'],
    metadata: {},
    path: `04-tasks/${status}/T-017-test.md`,
    priority: 'P1',
    projectId: null,
    spec: 'F-001',
    status,
    title: 'Agent board modal and cost dashboard',
    updatedAt: '2026-05-14T10:00:00.000Z',
    ...overrides,
  };
}
