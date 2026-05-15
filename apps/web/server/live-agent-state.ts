import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

import {
  AGENT_ROLES,
  type AgentRole,
  type VaultTask,
} from './vault-fs';

export const LIVE_AGENT_POLL_INTERVAL_MS = 5_000;

export type LiveAgentStatus = 'idle' | 'running' | 'stale';

export interface LiveAgentActionState {
  fullLogEnabled: boolean;
  killEnabled: boolean;
  pauseEnabled: boolean;
}

export interface LiveAgentCardState {
  actions: LiveAgentActionState;
  costLabel: string;
  elapsedLabel: string;
  fullLogHref: string | null;
  lastOutput: string;
  logPath: string | null;
  model: string;
  role: AgentRole;
  roleLabel: string;
  runner: 'claude' | 'codex';
  status: LiveAgentStatus;
  taskId: string | null;
  taskTitle: string | null;
  updatedAt: string;
}

export interface LiveAgentSnapshot {
  activeCount: number;
  agents: LiveAgentCardState[];
  pollIntervalMs: number;
  refreshedAt: string;
  totalRoles: number;
}

export interface ReadLiveAgentSnapshotOptions {
  now?: () => Date;
  tasks: VaultTask[];
  worktreeBase?: string;
}

interface LogSummary {
  content: string;
  lastOutput: string | null;
  logPath: string;
  processFinished: boolean;
  model: string | null;
  runner: 'claude' | 'codex' | null;
  startedAt: string | null;
  updatedAt: string;
}

const defaultModels: Record<AgentRole, string> = {
  architect: 'opus',
  designer: 'sonnet',
  developer: 'gpt-5.5',
  pm: 'sonnet',
  reviewer: 'opus',
  tester: 'gpt-5.5',
};

const defaultRunners: Record<AgentRole, 'claude' | 'codex'> = {
  architect: 'claude',
  designer: 'claude',
  developer: 'codex',
  pm: 'claude',
  reviewer: 'claude',
  tester: 'codex',
};

const roleLabels: Record<AgentRole, string> = {
  architect: 'Architect',
  designer: 'Designer',
  developer: 'Developer',
  pm: 'PM',
  reviewer: 'Reviewer',
  tester: 'Tester',
};

const ignoredLogPrefixes = [
  '--------',
  'approval:',
  'model:',
  'provider:',
  'reasoning effort:',
  'reasoning summaries:',
  'sandbox:',
  'session id:',
  'workdir:',
];

export async function readLiveAgentSnapshot({
  now = () => new Date(),
  tasks,
  worktreeBase = defaultWorktreeBase(),
}: ReadLiveAgentSnapshotOptions): Promise<LiveAgentSnapshot> {
  const currentTime = now();
  const agents: LiveAgentCardState[] = [];

  for (const role of AGENT_ROLES) {
    const runningTasks = tasks
      .filter((task) => task.assignee === role && task.status === 'in-progress')
      .sort(compareTasksByUpdatedAt);

    if (runningTasks.length > 0) {
      const runningAgents = await Promise.all(
        runningTasks.map((task) => createRunningAgentState(role, task, worktreeBase, currentTime)),
      );
      agents.push(...runningAgents);
      continue;
    }

    agents.push(createIdleAgentState(role, tasks, currentTime));
  }

  return {
    activeCount: agents.filter((agent) => agent.status === 'running').length,
    agents,
    pollIntervalMs: LIVE_AGENT_POLL_INTERVAL_MS,
    refreshedAt: currentTime.toISOString(),
    totalRoles: AGENT_ROLES.length,
  };
}

export function defaultWorktreeBase(cwd = process.cwd()): string {
  const explicit = process.env.ORCHESTRATOR_WORKTREE_BASE;
  if (explicit !== undefined && explicit.trim() !== '') {
    return resolve(explicit);
  }

  let currentPath = resolve(cwd);
  while (true) {
    if (/^T-\d{3,}/.test(basename(currentPath))) {
      return dirname(currentPath);
    }

    const parentPath = dirname(currentPath);
    if (parentPath === currentPath) {
      break;
    }

    currentPath = parentPath;
  }

  return resolve(cwd, 'worktrees');
}

export async function readLiveAgentLog(
  taskId: string,
  worktreeBase = defaultWorktreeBase(),
): Promise<LogSummary | null> {
  if (!/^T-\d{3,}$/.test(taskId)) {
    throw new Error(`Invalid task id: ${taskId}`);
  }

  return readTaskLogSummary(taskId, worktreeBase);
}

async function createRunningAgentState(
  role: AgentRole,
  task: VaultTask,
  worktreeBase: string,
  now: Date,
): Promise<LiveAgentCardState> {
  const log = await readTaskLogSummary(task.id, worktreeBase);
  const startedAt = log?.startedAt ?? task.updatedAt;
  const updatedAt = log?.updatedAt ?? task.updatedAt;
  const status: LiveAgentStatus = log?.processFinished ? 'stale' : 'running';

  return {
    actions: {
      fullLogEnabled: true,
      killEnabled: true,
      pauseEnabled: false,
    },
    costLabel: 'meter pending',
    elapsedLabel: `${formatElapsed(startedAt, now)} elapsed`,
    fullLogHref: `/api/admin/orchestrator/live-agents/log?taskId=${encodeURIComponent(task.id)}`,
    lastOutput: status === 'stale'
      ? log?.lastOutput ?? `Last run for ${task.id} finished but the task is still in progress.`
      : log?.lastOutput ?? `Working on ${task.title}.`,
    logPath: log?.logPath ?? null,
    model: log?.model ?? defaultModels[role],
    role,
    roleLabel: roleLabels[role],
    runner: log?.runner ?? defaultRunners[role],
    status,
    taskId: task.id,
    taskTitle: task.title,
    updatedAt,
  };
}

function createIdleAgentState(
  role: AgentRole,
  tasks: VaultTask[],
  now: Date,
): LiveAgentCardState {
  const latestTask = tasks
    .filter((task) => task.assignee === role)
    .sort(compareTasksByUpdatedAt)[0];

  const lastSeenLabel = latestTask === undefined
    ? 'no history'
    : `last seen ${formatRelative(latestTask.updatedAt, now)}`;

  return {
    actions: {
      fullLogEnabled: false,
      killEnabled: false,
      pauseEnabled: false,
    },
    costLabel: 'no active spend',
    elapsedLabel: lastSeenLabel,
    fullLogHref: null,
    lastOutput: latestTask === undefined
      ? `${roleLabels[role]} idle.`
      : `Idle. Last task ${latestTask.id}: ${latestTask.title}.`,
    logPath: null,
    model: defaultModels[role],
    role,
    roleLabel: roleLabels[role],
    runner: defaultRunners[role],
    status: 'idle',
    taskId: null,
    taskTitle: null,
    updatedAt: latestTask?.updatedAt ?? now.toISOString(),
  };
}

async function readTaskLogSummary(taskId: string, worktreeBase: string): Promise<LogSummary | null> {
  const worktreePath = await resolveTaskWorktreePath(taskId, worktreeBase);
  const stdoutLogPath = join(worktreePath, '.orchestrator-stdout.log');
  const stdoutLogStat = await safeStat(stdoutLogPath);
  const processFinished = stdoutLogStat?.isFile() ?? false;
  const logPaths = [
    join(worktreePath, '.orchestrator-live.log'),
    stdoutLogPath,
  ];

  for (const logPath of logPaths) {
    const fileStat = await safeStat(logPath);
    if (fileStat === null || !fileStat.isFile()) {
      continue;
    }

    const content = await readFile(logPath, 'utf-8');
    const metadata = parseLogMetadata(content);

    return {
      content,
      lastOutput: extractLastOutput(content),
      logPath,
      model: metadata.model,
      processFinished,
      runner: metadata.runner,
      startedAt: metadata.startedAt,
      updatedAt: fileStat.mtime.toISOString(),
    };
  }

  return null;
}

async function resolveTaskWorktreePath(taskId: string, worktreeBase: string): Promise<string> {
  const exactPath = join(worktreeBase, taskId);
  const exactStat = await safeStat(exactPath);
  if (exactStat?.isDirectory()) {
    return exactPath;
  }

  const entries = await safeReadDir(worktreeBase);
  const matchingEntry = entries.find((entry) => (
    entry.isDirectory() && (entry.name === taskId || entry.name.startsWith(`${taskId}-`))
  ));

  return join(worktreeBase, matchingEntry?.name ?? taskId);
}

function parseLogMetadata(content: string): {
  model: string | null;
  runner: 'claude' | 'codex' | null;
  startedAt: string | null;
} {
  const firstLine = content.split(/\r?\n/, 1)[0] ?? '';
  const match = firstLine.match(/ via (claude|codex):(\S+) started at (\S+)/);

  if (match === null) {
    return {
      model: null,
      runner: null,
      startedAt: null,
    };
  }

  return {
    model: match[2],
    runner: match[1] as 'claude' | 'codex',
    startedAt: match[3],
  };
}

function extractLastOutput(content: string): string | null {
  const lines = stripAnsi(content)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith('[agent]'))
    .filter((line) => !line.includes('WARN codex_core_plugins::manifest'))
    .filter((line) => !line.includes('WARN codex_core_skills::loader'))
    .filter((line) => !ignoredLogPrefixes.some((prefix) => line.startsWith(prefix)));

  const lastLine = lines.at(-1);
  return lastLine === undefined ? null : truncate(lastLine, 180);
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, '');
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function formatElapsed(startedAt: string, now: Date): string {
  const started = parseDate(startedAt) ?? now;
  const totalSeconds = Math.max(0, Math.floor((now.getTime() - started.getTime()) / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  }

  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

function formatRelative(dateValue: string, now: Date): string {
  const date = parseDate(dateValue);
  if (date === null) {
    return 'unknown';
  }

  const totalMinutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
  if (totalMinutes < 60) {
    return `${totalMinutes}m ago`;
  }

  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    return `${totalHours}h ${totalMinutes % 60}m ago`;
  }

  return `${Math.floor(totalHours / 24)}d ago`;
}

function parseDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function compareTasksByUpdatedAt(a: VaultTask, b: VaultTask): number {
  return b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);
}

async function safeStat(path: string) {
  try {
    return await stat(path);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

async function safeReadDir(path: string) {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}
