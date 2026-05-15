import type {
  AgentRun,
  DailyCost,
} from '@crm-orchestrator/db/schema';

import type {
  LiveAgentSnapshot,
  LiveAgentStatus,
} from './live-agent-state';
import {
  AGENT_ROLES,
  type AgentRole,
  type TaskPriority,
  type TaskStatus,
  type VaultTask,
} from './vault-fs';

export interface AgentBoardData {
  generatedAt: string;
  roles: AgentBoardRole[];
  summary: {
    activeAgents: number;
    averageSuccessRateLabel: string;
    queuedTasks: number;
    totalAgents: number;
    weekCostLabel: string;
  };
}

export interface AgentBoardRole {
  activeTaskId: string | null;
  activeTaskTitle: string | null;
  averageCostPerTaskLabel: string;
  averageTaskTimeLabel: string;
  costTodayLabel: string;
  costWeekLabel: string;
  model: string;
  queueCount: number;
  queuePreview: AgentBoardQueueTask[];
  role: AgentRole;
  roleLabel: string;
  runner: 'claude' | 'codex';
  status: LiveAgentStatus;
  successRateLabel: string;
  successRatePercent: number | null;
  tasksCompletedWeek: number;
}

export interface AgentBoardQueueTask {
  id: string;
  priority: TaskPriority;
  status: TaskStatus;
  title: string;
}

export interface BuildAgentBoardDataInput {
  dailyCosts?: readonly DailyCost[];
  liveAgentSnapshot: LiveAgentSnapshot;
  now?: Date;
  recentRuns?: readonly AgentRun[];
  tasks: readonly VaultTask[];
}

export const AGENT_ROLE_LABELS: Record<AgentRole, string> = {
  architect: 'Architect',
  designer: 'Designer',
  developer: 'Developer',
  pm: 'PM',
  reviewer: 'Reviewer',
  tester: 'Tester',
};

const AGENT_ROLE_RUNNERS: Record<AgentRole, 'claude' | 'codex'> = {
  architect: 'claude',
  designer: 'claude',
  developer: 'codex',
  pm: 'claude',
  reviewer: 'claude',
  tester: 'codex',
};

const AGENT_ROLE_MODELS: Record<AgentRole, string> = {
  architect: 'opus',
  designer: 'sonnet',
  developer: 'gpt-5.5',
  pm: 'sonnet',
  reviewer: 'opus',
  tester: 'gpt-5.5',
};

const queuedStatuses = new Set<TaskStatus>([
  'backlog',
  'blocked-question',
  'failed',
  'in-progress',
  'merge-ready',
  'review',
]);

const terminalRunStatuses = new Set<AgentRun['status']>([
  'failed',
  'killed',
  'success',
  'timeout',
]);

const priorityRank: Record<TaskPriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

const statusRank: Record<TaskStatus, number> = {
  'in-progress': 0,
  review: 1,
  'merge-ready': 2,
  backlog: 3,
  'blocked-question': 4,
  failed: 5,
  done: 6,
};

const usdFormatter = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: 'currency',
});

export function buildAgentBoardData({
  dailyCosts = [],
  liveAgentSnapshot,
  now = new Date(),
  recentRuns = [],
  tasks,
}: BuildAgentBoardDataInput): AgentBoardData {
  const roles = AGENT_ROLES.map((role) => buildAgentBoardRole({
    dailyCosts,
    liveAgentSnapshot,
    now,
    recentRuns,
    role,
    tasks,
  }));
  const terminalRuns = recentRuns.filter((run) => (
    isInLastSevenDays(run.finishedAt ?? run.startedAt, now)
    && terminalRunStatuses.has(run.status)
  ));
  const successfulRuns = terminalRuns.filter((run) => run.status === 'success').length;
  const weekCostUsd = dailyCosts
    .filter((cost) => isInLastSevenDays(cost.date, now))
    .reduce((sum, cost) => sum + cost.costUsd, 0);

  return {
    generatedAt: now.toISOString(),
    roles,
    summary: {
      activeAgents: liveAgentSnapshot.activeCount,
      averageSuccessRateLabel: terminalRuns.length === 0
        ? 'no finished runs'
        : `${formatPercent((successfulRuns / terminalRuns.length) * 100)} success`,
      queuedTasks: roles.reduce((sum, role) => sum + role.queueCount, 0),
      totalAgents: liveAgentSnapshot.totalRoles,
      weekCostLabel: formatUsd(weekCostUsd),
    },
  };
}

function buildAgentBoardRole({
  dailyCosts,
  liveAgentSnapshot,
  now,
  recentRuns,
  role,
  tasks,
}: {
  dailyCosts: readonly DailyCost[];
  liveAgentSnapshot: LiveAgentSnapshot;
  now: Date;
  recentRuns: readonly AgentRun[];
  role: AgentRole;
  tasks: readonly VaultTask[];
}): AgentBoardRole {
  const liveAgent = liveAgentSnapshot.agents.find((agent) => agent.role === role);
  const queue = tasks
    .filter((task) => task.assignee === role && queuedStatuses.has(task.status))
    .sort(compareQueueTasks);
  const roleRuns = recentRuns.filter((run) => (
    run.agentRole === role
    && isInLastSevenDays(run.finishedAt ?? run.startedAt, now)
  ));
  const finishedRuns = roleRuns.filter((run) => terminalRunStatuses.has(run.status));
  const successfulRuns = finishedRuns.filter((run) => run.status === 'success').length;
  const taskDurations = finishedRuns
    .map(readDurationMs)
    .filter((duration): duration is number => duration !== null);
  const roleCostRows = dailyCosts.filter((cost) => (
    cost.agentRole === role
    && isInLastSevenDays(cost.date, now)
  ));
  const weekCostUsd = roleCostRows.reduce((sum, cost) => sum + cost.costUsd, 0);
  const todayCostUsd = roleCostRows
    .filter((cost) => dateKey(cost.date) === dateKey(now))
    .reduce((sum, cost) => sum + cost.costUsd, 0);
  const tasksCompletedWeek = roleCostRows
    .reduce((sum, cost) => sum + cost.tasksCompleted, 0);
  const successRatePercent = finishedRuns.length === 0
    ? null
    : (successfulRuns / finishedRuns.length) * 100;

  return {
    activeTaskId: liveAgent?.taskId ?? null,
    activeTaskTitle: liveAgent?.taskTitle ?? null,
    averageCostPerTaskLabel: tasksCompletedWeek === 0
      ? 'no completions'
      : `${formatUsd(weekCostUsd / tasksCompletedWeek)} / task`,
    averageTaskTimeLabel: taskDurations.length === 0
      ? 'no finished runs'
      : formatDuration(average(taskDurations)),
    costTodayLabel: formatUsd(todayCostUsd),
    costWeekLabel: formatUsd(weekCostUsd),
    model: liveAgent?.model ?? AGENT_ROLE_MODELS[role],
    queueCount: queue.length,
    queuePreview: queue.slice(0, 3).map((task) => ({
      id: task.id,
      priority: task.priority,
      status: task.status,
      title: task.title,
    })),
    role,
    roleLabel: AGENT_ROLE_LABELS[role],
    runner: liveAgent?.runner ?? AGENT_ROLE_RUNNERS[role],
    status: liveAgent?.status ?? 'idle',
    successRateLabel: successRatePercent === null
      ? 'no finished runs'
      : `${formatPercent(successRatePercent)} success`,
    successRatePercent,
    tasksCompletedWeek,
  };
}

function compareQueueTasks(a: VaultTask, b: VaultTask): number {
  return (
    statusRank[a.status] - statusRank[b.status]
    || priorityRank[a.priority] - priorityRank[b.priority]
    || b.updatedAt.localeCompare(a.updatedAt)
    || a.id.localeCompare(b.id)
  );
}

function isInLastSevenDays(date: Date, now: Date): boolean {
  const sixDaysAgo = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - 6,
  ));
  const day = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  ));

  return day >= sixDaysAgo && day <= now;
}

function readDurationMs(run: AgentRun): number | null {
  if (run.finishedAt === null) {
    return null;
  }

  return Math.max(0, run.finishedAt.getTime() - run.startedAt.getTime());
}

function average(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatDuration(milliseconds: number): string {
  const totalMinutes = Math.max(0, Math.round(milliseconds / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  }

  return `${minutes}m`;
}

function formatPercent(percent: number): string {
  return `${Math.round(percent)}%`;
}

function formatUsd(value: number): string {
  return usdFormatter.format(value);
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
