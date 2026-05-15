import type { AgentRun } from '@crm-orchestrator/db/schema';

import {
  AGENT_ROLES,
  type AgentRole,
  type TaskStatus,
  type VaultTask,
} from './vault-fs';

export const PR_QUEUE_CI_STATUSES = ['green', 'yellow', 'red', 'unknown'] as const;
export const PR_QUEUE_REVIEWER_STATUSES = [
  'approved',
  'changes-requested',
  'pending',
  'unknown',
] as const;

export type PrQueueCiStatus = (typeof PR_QUEUE_CI_STATUSES)[number];
export type PrQueueReviewerStatus = (typeof PR_QUEUE_REVIEWER_STATUSES)[number];

export interface PrQueueItem {
  assignee: AgentRole;
  branch: string | null;
  ciStatus: PrQueueCiStatus;
  githubUrl: string | null;
  mergeEnabled: boolean;
  openedAt: string;
  prNumber: number;
  reviewerStatus: PrQueueReviewerStatus;
  taskId: string;
  taskStatus: TaskStatus | null;
  title: string;
}

export interface BuildPrQueueItemsInput {
  runs?: readonly AgentRun[];
  tasks: readonly VaultTask[];
}

const metadataPrNumberKeys = ['prNumber', 'pr_number', 'pullRequestNumber', 'pull_request_number'];
const metadataStringKeys = {
  branch: ['branch'],
  githubUrl: ['githubUrl', 'github_url', 'prUrl', 'pr_url', 'pullRequestUrl', 'pull_request_url'],
  openedAt: ['openedAt', 'opened_at', 'createdAt', 'created_at'],
  title: ['prTitle', 'pr_title', 'pullRequestTitle', 'pull_request_title'],
} as const;

export function buildPrQueueItems({
  runs = [],
  tasks,
}: BuildPrQueueItemsInput): PrQueueItem[] {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const itemsByPrNumber = new Map<number, PrQueueItem>();

  for (const run of runs) {
    if (run.prNumber === null) {
      continue;
    }

    const task = tasksById.get(run.taskId);
    if (!isOpenPrTask(task)) {
      continue;
    }

    const item = createPrQueueItem({
      branch: run.branch,
      metadata: {
        ...task?.metadata,
        ...run.metadata,
      },
      openedAt: run.startedAt.toISOString(),
      prNumber: run.prNumber,
      run,
      task,
      taskId: run.taskId,
    });

    const existing = itemsByPrNumber.get(item.prNumber);
    if (existing === undefined || item.openedAt > existing.openedAt) {
      itemsByPrNumber.set(item.prNumber, item);
    }
  }

  for (const task of tasks) {
    if (!isOpenPrTask(task)) {
      continue;
    }

    const prNumber = readPrNumber(task.metadata);
    if (prNumber === null || itemsByPrNumber.has(prNumber)) {
      continue;
    }

    itemsByPrNumber.set(
      prNumber,
      createPrQueueItem({
        branch: null,
        metadata: task.metadata,
        openedAt: task.updatedAt,
        prNumber,
        run: null,
        task,
        taskId: task.id,
      }),
    );
  }

  return [...itemsByPrNumber.values()].sort(comparePrQueueItems);
}

export function formatPrAgeLabel(openedAt: string, now = new Date()): string {
  const timestamp = Date.parse(openedAt);

  if (Number.isNaN(timestamp)) {
    return 'unknown age';
  }

  const elapsedMs = Math.max(0, now.getTime() - timestamp);
  const minuteMs = 60_000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const weekMs = 7 * dayMs;

  if (elapsedMs < minuteMs) {
    return 'now';
  }

  if (elapsedMs < hourMs) {
    return `${Math.floor(elapsedMs / minuteMs)}m`;
  }

  if (elapsedMs < 48 * hourMs) {
    return `${Math.floor(elapsedMs / hourMs)}h`;
  }

  if (elapsedMs < weekMs) {
    return `${Math.floor(elapsedMs / dayMs)}d`;
  }

  return `${Math.floor(elapsedMs / weekMs)}w`;
}

function createPrQueueItem(input: {
  branch: string | null;
  metadata: Record<string, unknown>;
  openedAt: string;
  prNumber: number;
  run: AgentRun | null;
  task: VaultTask | undefined;
  taskId: string;
}): PrQueueItem {
  const taskStatus = input.task?.status ?? null;
  const ciStatus = readCiStatus(input.metadata) ?? defaultCiStatus(taskStatus);
  const reviewerStatus = readReviewerStatus(input.metadata) ?? defaultReviewerStatus(taskStatus);
  const branch = readString(input.metadata, metadataStringKeys.branch) ?? input.branch;
  const title = readString(input.metadata, metadataStringKeys.title)
    ?? input.task?.title
    ?? input.taskId;
  const runAssignee = input.run?.agentRole;

  return {
    assignee: input.task?.assignee
      ?? (runAssignee !== undefined && isAgentRole(runAssignee) ? runAssignee : 'developer'),
    branch,
    ciStatus,
    githubUrl: readString(input.metadata, metadataStringKeys.githubUrl),
    mergeEnabled: ciStatus === 'green' && reviewerStatus === 'approved',
    openedAt: readString(input.metadata, metadataStringKeys.openedAt) ?? input.openedAt,
    prNumber: input.prNumber,
    reviewerStatus,
    taskId: input.taskId,
    taskStatus,
    title,
  };
}

function defaultCiStatus(taskStatus: TaskStatus | null): PrQueueCiStatus {
  if (taskStatus === 'merge-ready') {
    return 'green';
  }

  return 'unknown';
}

function defaultReviewerStatus(taskStatus: TaskStatus | null): PrQueueReviewerStatus {
  if (taskStatus === 'merge-ready') {
    return 'approved';
  }

  if (taskStatus === 'review') {
    return 'pending';
  }

  return 'unknown';
}

function isOpenPrTask(task: VaultTask | undefined): boolean {
  if (task === undefined) {
    return true;
  }

  return task.status === 'review' || task.status === 'merge-ready';
}

function comparePrQueueItems(a: PrQueueItem, b: PrQueueItem): number {
  return (
    prQueueRank(a) - prQueueRank(b)
    || Date.parse(a.openedAt) - Date.parse(b.openedAt)
    || a.prNumber - b.prNumber
  );
}

function prQueueRank(item: PrQueueItem): number {
  if (item.mergeEnabled) {
    return 0;
  }

  if (item.ciStatus === 'green') {
    return 1;
  }

  if (item.reviewerStatus === 'approved') {
    return 2;
  }

  if (item.ciStatus === 'red' || item.reviewerStatus === 'changes-requested') {
    return 4;
  }

  return 3;
}

function readPrNumber(metadata: Record<string, unknown>): number | null {
  for (const key of metadataPrNumberKeys) {
    const value = metadata[key];

    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isInteger(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }

  return null;
}

function readCiStatus(metadata: Record<string, unknown>): PrQueueCiStatus | null {
  const value = readString(metadata, ['ciStatus', 'ci_status', 'ci']);

  if (value === 'green' || value === 'yellow' || value === 'red' || value === 'unknown') {
    return value;
  }

  if (value === 'success' || value === 'passing' || value === 'passed') {
    return 'green';
  }

  if (value === 'failure' || value === 'failed' || value === 'failing') {
    return 'red';
  }

  if (value === 'pending' || value === 'queued' || value === 'running') {
    return 'yellow';
  }

  return null;
}

function readReviewerStatus(metadata: Record<string, unknown>): PrQueueReviewerStatus | null {
  const value = readString(metadata, ['reviewerStatus', 'reviewer_status', 'review']);

  if (
    value === 'approved'
    || value === 'changes-requested'
    || value === 'pending'
    || value === 'unknown'
  ) {
    return value;
  }

  if (value === 'changes_requested' || value === 'request-changes') {
    return 'changes-requested';
  }

  return null;
}

function readString(
  metadata: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }

  return null;
}

function isAgentRole(role: string): role is AgentRole {
  return AGENT_ROLES.some((knownRole) => knownRole === role);
}
