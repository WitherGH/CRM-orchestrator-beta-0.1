import type { CSSProperties } from 'react';

export const TOP_STAT_TASK_STATUSES = [
  'backlog',
  'in-progress',
  'review',
  'merge-ready',
  'failed',
  'done',
] as const;

export type TopStatTaskStatus = (typeof TOP_STAT_TASK_STATUSES)[number];
export type TopStatTone = 'alert' | 'critical' | 'neutral' | 'positive';
export type TopStatCiStatus = 'green' | 'red' | 'unknown' | 'yellow';
export type TopStatBotKillStatus = 'clear' | 'halted' | 'unknown';

export type TopStatTaskCounts = Record<TopStatTaskStatus, number>;

export interface TopStatBarData {
  agents: {
    active: number;
    total: number;
  };
  botKill: {
    haltedCount: number;
    status: TopStatBotKillStatus;
  };
  ci: {
    detail?: string;
    status: TopStatCiStatus;
  };
  cost: {
    dailyCapUsd: number;
    progressPercent: number;
    todayUsd: number;
  };
  taskCounts: TopStatTaskCounts;
}

export interface TopStatBarProps {
  agentHref?: string;
  data: TopStatBarData;
  kanbanHref?: string;
}

export interface TopStatSourceTask {
  status: string;
}

export interface TopStatSourceDailyCost {
  costUsd: number;
  date: Date;
}

export interface TopStatSourceAgentRun {
  status: string;
}

export interface CreateTopStatBarDataInput {
  botKillStatus?: TopStatBotKillStatus;
  ciDetail?: string;
  ciStatus?: TopStatCiStatus;
  dailyCostCapUsd?: number;
  dailyCosts?: readonly TopStatSourceDailyCost[];
  haltedBotCount?: number;
  now?: Date;
  recentRuns?: readonly TopStatSourceAgentRun[];
  tasks: readonly TopStatSourceTask[];
  totalAgents?: number;
}

type ProgressStyle = CSSProperties & {
  '--orchestrator-progress': string;
};

type TaskSegment = {
  href: string;
  label: string;
  status: TopStatTaskStatus;
  value: number;
};

const defaultDailyCostCapUsd = 50;
const defaultTotalAgents = 6;

const taskStatusLabels: Record<TopStatTaskStatus, string> = {
  backlog: 'backlog',
  done: 'done',
  failed: 'failed',
  'in-progress': 'in-flight',
  'merge-ready': 'merge-ready',
  review: 'review',
};

const usdFormatter = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: 'currency',
});

export function createEmptyTaskCounts(): TopStatTaskCounts {
  return {
    backlog: 0,
    done: 0,
    failed: 0,
    'in-progress': 0,
    'merge-ready': 0,
    review: 0,
  };
}

export function createTopStatBarData(input: CreateTopStatBarDataInput): TopStatBarData {
  const dailyCapUsd = input.dailyCostCapUsd ?? defaultDailyCostCapUsd;
  const todayUsd = sumTodayCost(input.dailyCosts ?? [], input.now ?? new Date());
  const haltedCount = input.haltedBotCount ?? 0;

  return {
    agents: {
      active: countActiveRuns(input.recentRuns ?? []),
      total: input.totalAgents ?? defaultTotalAgents,
    },
    botKill: {
      haltedCount,
      status: input.botKillStatus ?? (haltedCount > 0 ? 'halted' : 'clear'),
    },
    ci: {
      detail: input.ciDetail,
      status: input.ciStatus ?? 'unknown',
    },
    cost: {
      dailyCapUsd,
      progressPercent: calculateCostProgress(todayUsd, dailyCapUsd),
      todayUsd,
    },
    taskCounts: countTasksByStatus(input.tasks),
  };
}

export function TopStatBar({
  agentHref = '#orchestrator-agent-board-modal',
  data,
  kanbanHref = '/admin/orchestrator',
}: TopStatBarProps) {
  const taskSegments = createTaskSegments(data.taskCounts, kanbanHref);
  const costTone = getCostTone(data.cost.progressPercent);
  const ciTone = getCiTone(data.ci.status);
  const botKillTone = getBotKillTone(data.botKill.status);

  return (
    <header className="orchestrator-stat-bar" aria-label="Orchestrator stats">
      <div className="orchestrator-stat">
        <span className="orchestrator-label">Tasks</span>
        <span className="orchestrator-stat-value">
          <span className="orchestrator-stat-segments">
            {taskSegments.map((segment) => (
              <a
                aria-label={`${segment.value} ${segment.label} tasks`}
                className="orchestrator-stat-segment orchestrator-stat-link"
                href={segment.href}
                key={segment.status}
              >
                <span className="orchestrator-stat-segment-value">{segment.value}</span>
                <span>{segment.label}</span>
              </a>
            ))}
          </span>
        </span>
      </div>

      <div className="orchestrator-stat">
        <span className="orchestrator-label">Cost</span>
        <span className="orchestrator-stat-value">
          <span>{formatUsd(data.cost.todayUsd)} today</span>
          <span className="orchestrator-stat-secondary">
            {formatUsd(data.cost.dailyCapUsd)} cap
          </span>
        </span>
        <span
          aria-label={`Daily cost is ${formatPercent(data.cost.progressPercent)} of cap`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.round(data.cost.progressPercent)}
          className="orchestrator-cost-track"
          role="progressbar"
        >
          <span
            className="orchestrator-cost-fill"
            data-tone={costTone}
            style={progressStyle(data.cost.progressPercent)}
          />
        </span>
      </div>

      <a
        aria-label={`Open agent board, ${data.agents.active} active agents`}
        className="orchestrator-stat orchestrator-stat-action"
        href={agentHref}
      >
        <span className="orchestrator-label">Agents</span>
        <span className="orchestrator-stat-value">
          <span
            aria-hidden="true"
            className="orchestrator-status-dot"
            data-tone={data.agents.active > 0 ? 'positive' : 'neutral'}
          />
          <span>{data.agents.active} active</span>
          <span className="orchestrator-stat-secondary">{data.agents.total} total</span>
        </span>
      </a>

      <div className="orchestrator-stat">
        <span className="orchestrator-label">CI</span>
        <span className="orchestrator-stat-value">
          <span aria-hidden="true" className="orchestrator-status-dot" data-tone={ciTone} />
          <span>{formatCiStatus(data.ci.status)}</span>
          {data.ci.detail ? (
            <span className="orchestrator-stat-secondary">{data.ci.detail}</span>
          ) : null}
        </span>
      </div>

      <div className="orchestrator-stat">
        <span className="orchestrator-label">Bot kill</span>
        <span className="orchestrator-stat-value">
          <span
            aria-hidden="true"
            className="orchestrator-status-dot"
            data-tone={botKillTone}
          />
          <span>{formatBotKillStatus(data.botKill.status)}</span>
          {data.botKill.haltedCount > 0 ? (
            <span className="orchestrator-stat-secondary">
              {data.botKill.haltedCount} halted
            </span>
          ) : null}
        </span>
      </div>
    </header>
  );
}

function countTasksByStatus(tasks: readonly TopStatSourceTask[]): TopStatTaskCounts {
  const counts = createEmptyTaskCounts();

  for (const task of tasks) {
    if (isTopStatTaskStatus(task.status)) {
      counts[task.status] += 1;
    }
  }

  return counts;
}

function createTaskSegments(
  counts: TopStatTaskCounts,
  kanbanHref: string,
): TaskSegment[] {
  return TOP_STAT_TASK_STATUSES.map((status) => ({
    href: `${kanbanHref}?status=${encodeURIComponent(status)}`,
    label: taskStatusLabels[status],
    status,
    value: counts[status],
  }));
}

function isTopStatTaskStatus(status: string): status is TopStatTaskStatus {
  return TOP_STAT_TASK_STATUSES.some((knownStatus) => knownStatus === status);
}

function sumTodayCost(costs: readonly TopStatSourceDailyCost[], now: Date): number {
  const today = dateKey(now);

  return costs
    .filter((cost) => dateKey(cost.date) === today)
    .reduce((sum, cost) => sum + cost.costUsd, 0);
}

function countActiveRuns(runs: readonly TopStatSourceAgentRun[]): number {
  return runs.filter((run) => run.status === 'running').length;
}

function calculateCostProgress(todayUsd: number, dailyCapUsd: number): number {
  if (dailyCapUsd <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, (todayUsd / dailyCapUsd) * 100));
}

function getCostTone(progressPercent: number): TopStatTone {
  if (progressPercent >= 100) {
    return 'critical';
  }

  if (progressPercent >= 80) {
    return 'alert';
  }

  return 'positive';
}

function getCiTone(status: TopStatCiStatus): TopStatTone {
  if (status === 'green') {
    return 'positive';
  }

  if (status === 'yellow') {
    return 'alert';
  }

  if (status === 'red') {
    return 'critical';
  }

  return 'neutral';
}

function getBotKillTone(status: TopStatBotKillStatus): TopStatTone {
  if (status === 'halted') {
    return 'critical';
  }

  if (status === 'clear') {
    return 'positive';
  }

  return 'neutral';
}

function formatCiStatus(status: TopStatCiStatus): string {
  if (status === 'green') {
    return 'Green';
  }

  if (status === 'yellow') {
    return 'Yellow';
  }

  if (status === 'red') {
    return 'Red';
  }

  return 'Unknown';
}

function formatBotKillStatus(status: TopStatBotKillStatus): string {
  if (status === 'halted') {
    return 'Halted';
  }

  if (status === 'clear') {
    return 'Clear';
  }

  return 'Unknown';
}

function formatUsd(value: number): string {
  return usdFormatter.format(value);
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function progressStyle(progressPercent: number): ProgressStyle {
  return {
    '--orchestrator-progress': `${progressPercent}%`,
  };
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
