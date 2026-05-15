import type { DailyCost } from '@crm-orchestrator/db/schema';

import { AGENT_ROLE_LABELS } from './agent-board';
import {
  AGENT_ROLES,
  type AgentRole,
} from './vault-fs';

export type CostDashboardTone = 'alert' | 'critical' | 'positive';

export interface CostDashboardData {
  cap: {
    dailyCapLabel: string;
    progressPercent: number;
    remainingLabel: string;
    statusLabel: string;
    tone: CostDashboardTone;
  };
  dayRows: CostDashboardDayRow[];
  generatedAt: string;
  roleRows: CostDashboardRoleRow[];
  summary: {
    monthlyProjectionLabel: string;
    tasksCompletedWeek: number;
    todayLabel: string;
    weekLabel: string;
  };
}

export interface CostDashboardDayRow {
  costLabelsByRole: Record<AgentRole, string>;
  dateKey: string;
  dayLabel: string;
  totalLabel: string;
}

export interface CostDashboardRoleRow {
  averageCostPerTaskLabel: string;
  role: AgentRole;
  roleLabel: string;
  shareLabel: string;
  tasksCompletedWeek: number;
  todayLabel: string;
  weekLabel: string;
}

export interface BuildCostDashboardDataInput {
  dailyCapUsd?: number;
  dailyCosts?: readonly DailyCost[];
  now?: Date;
}

const defaultDailyCapUsd = 50;

const usdFormatter = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
  style: 'currency',
});

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  day: '2-digit',
  month: 'short',
});

export function buildCostDashboardData({
  dailyCapUsd = defaultDailyCapUsd,
  dailyCosts = [],
  now = new Date(),
}: BuildCostDashboardDataInput = {}): CostDashboardData {
  const dayKeys = createLastSevenDateKeys(now);
  const costsByDayRole = createCostMatrix(dailyCosts, dayKeys);
  const dayRows = dayKeys.map((dayKey) => createDayRow(dayKey, costsByDayRole));
  const todayUsd = sumDay(costsByDayRole, dayKeys[0]);
  const weekUsd = dayRows.reduce((sum, row) => sum + readTotal(costsByDayRole, row.dateKey), 0);
  const tasksCompletedWeek = dailyCosts
    .filter((cost) => dayKeys.includes(dateKey(cost.date)))
    .reduce((sum, cost) => sum + cost.tasksCompleted, 0);
  const progressPercent = calculateProgress(todayUsd, dailyCapUsd);

  return {
    cap: {
      dailyCapLabel: formatUsd(dailyCapUsd),
      progressPercent,
      remainingLabel: formatUsd(Math.max(dailyCapUsd - todayUsd, 0)),
      statusLabel: formatCapStatus(progressPercent),
      tone: getCapTone(progressPercent),
    },
    dayRows,
    generatedAt: now.toISOString(),
    roleRows: AGENT_ROLES.map((role) => createRoleRow({
      costsByDayRole,
      dailyCosts,
      dayKeys,
      role,
      weekUsd,
    })),
    summary: {
      monthlyProjectionLabel: formatUsd((weekUsd / dayKeys.length) * 30),
      tasksCompletedWeek,
      todayLabel: formatUsd(todayUsd),
      weekLabel: formatUsd(weekUsd),
    },
  };
}

function createRoleRow({
  costsByDayRole,
  dailyCosts,
  dayKeys,
  role,
  weekUsd,
}: {
  costsByDayRole: Record<string, Record<AgentRole, number>>;
  dailyCosts: readonly DailyCost[];
  dayKeys: readonly string[];
  role: AgentRole;
  weekUsd: number;
}): CostDashboardRoleRow {
  const todayUsd = costsByDayRole[dayKeys[0]][role];
  const roleWeekUsd = dayKeys.reduce((sum, dayKey) => sum + costsByDayRole[dayKey][role], 0);
  const tasksCompletedWeek = dailyCosts
    .filter((cost) => cost.agentRole === role && dayKeys.includes(dateKey(cost.date)))
    .reduce((sum, cost) => sum + cost.tasksCompleted, 0);

  return {
    averageCostPerTaskLabel: tasksCompletedWeek === 0
      ? 'no completions'
      : `${formatUsd(roleWeekUsd / tasksCompletedWeek)} / task`,
    role,
    roleLabel: AGENT_ROLE_LABELS[role],
    shareLabel: weekUsd === 0 ? '0%' : `${Math.round((roleWeekUsd / weekUsd) * 100)}%`,
    tasksCompletedWeek,
    todayLabel: formatUsd(todayUsd),
    weekLabel: formatUsd(roleWeekUsd),
  };
}

function createDayRow(
  dayKey: string,
  costsByDayRole: Record<string, Record<AgentRole, number>>,
): CostDashboardDayRow {
  const costLabelsByRole = Object.fromEntries(
    AGENT_ROLES.map((role) => [role, formatUsd(costsByDayRole[dayKey][role])]),
  ) as Record<AgentRole, string>;

  return {
    costLabelsByRole,
    dateKey: dayKey,
    dayLabel: dateFormatter.format(new Date(`${dayKey}T00:00:00.000Z`)),
    totalLabel: formatUsd(readTotal(costsByDayRole, dayKey)),
  };
}

function createCostMatrix(
  dailyCosts: readonly DailyCost[],
  dayKeys: readonly string[],
): Record<string, Record<AgentRole, number>> {
  const dayKeySet = new Set(dayKeys);
  const matrix = Object.fromEntries(
    dayKeys.map((dayKey) => [dayKey, zeroAgentRecord()]),
  ) as Record<string, Record<AgentRole, number>>;

  for (const cost of dailyCosts) {
    const key = dateKey(cost.date);
    if (!dayKeySet.has(key)) {
      continue;
    }

    matrix[key][cost.agentRole] += cost.costUsd;
  }

  return matrix;
}

function zeroAgentRecord(): Record<AgentRole, number> {
  return Object.fromEntries(AGENT_ROLES.map((role) => [role, 0])) as Record<AgentRole, number>;
}

function createLastSevenDateKeys(now: Date): string[] {
  return Array.from({ length: 7 }, (_value, index) => {
    const day = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - index,
    ));

    return dateKey(day);
  });
}

function sumDay(
  costsByDayRole: Record<string, Record<AgentRole, number>>,
  dayKey: string,
): number {
  return readTotal(costsByDayRole, dayKey);
}

function readTotal(
  costsByDayRole: Record<string, Record<AgentRole, number>>,
  dayKey: string,
): number {
  return AGENT_ROLES.reduce((sum, role) => sum + costsByDayRole[dayKey][role], 0);
}

function calculateProgress(todayUsd: number, dailyCapUsd: number): number {
  if (dailyCapUsd <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, (todayUsd / dailyCapUsd) * 100));
}

function getCapTone(progressPercent: number): CostDashboardTone {
  if (progressPercent >= 100) {
    return 'critical';
  }

  if (progressPercent >= 80) {
    return 'alert';
  }

  return 'positive';
}

function formatCapStatus(progressPercent: number): string {
  if (progressPercent >= 100) {
    return 'Cap hit';
  }

  if (progressPercent >= 80) {
    return 'Warning';
  }

  return 'Within cap';
}

function formatUsd(value: number): string {
  return usdFormatter.format(value);
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
