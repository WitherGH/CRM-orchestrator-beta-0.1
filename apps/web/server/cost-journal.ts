import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface CostJournalSummary {
  taskCostsUsd: Record<string, number>;
  todayEntryCount: number;
  todayUsd: number;
}

export interface BurnMeterData {
  capUsd: number;
  todayUsd: number;
}

const DEFAULT_DAILY_COST_CAP_USD = 50;

export const emptyCostJournalSummary: CostJournalSummary = {
  taskCostsUsd: {},
  todayEntryCount: 0,
  todayUsd: 0,
};

/**
 * Parses the append-only JSONL cost journal written by the orchestrator
 * (see recordCost in orchestrator/src/tick.ts) and sums today's spend.
 */
export function summarizeCostJournal(content: string, now: Date): CostJournalSummary {
  const taskCostsUsd: Record<string, number> = {};
  let todayEntryCount = 0;
  let todayUsd = 0;

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') {
      continue;
    }

    let entry: { taskId?: unknown; ts?: unknown; usd?: unknown };
    try {
      entry = JSON.parse(trimmed) as { taskId?: unknown; ts?: unknown; usd?: unknown };
    } catch {
      continue;
    }

    if (typeof entry.ts !== 'string' || typeof entry.usd !== 'number' || entry.usd < 0) {
      continue;
    }

    const ts = new Date(entry.ts);
    if (Number.isNaN(ts.getTime()) || !isSameLocalDay(ts, now)) {
      continue;
    }

    todayEntryCount += 1;
    todayUsd += entry.usd;

    if (typeof entry.taskId === 'string' && entry.taskId !== '') {
      taskCostsUsd[entry.taskId] = (taskCostsUsd[entry.taskId] ?? 0) + entry.usd;
    }
  }

  return { taskCostsUsd, todayEntryCount, todayUsd };
}

const ROLE_ESTIMATE_SAMPLE_SIZE = 20;

/**
 * Average cost of the most recent exact (non-estimated) runs per role —
 * the same signal the orchestrator's predictive cap uses before launching.
 */
export function estimateRoleCostsUsd(content: string): Record<string, number> {
  const samples = new Map<string, number[]>();

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') {
      continue;
    }

    let entry: { estimated?: unknown; role?: unknown; usd?: unknown };
    try {
      entry = JSON.parse(trimmed) as { estimated?: unknown; role?: unknown; usd?: unknown };
    } catch {
      continue;
    }

    if (
      typeof entry.role !== 'string'
      || typeof entry.usd !== 'number'
      || entry.usd < 0
      || entry.estimated === true
    ) {
      continue;
    }

    const roleSamples = samples.get(entry.role) ?? [];
    roleSamples.push(entry.usd);
    samples.set(entry.role, roleSamples);
  }

  return Object.fromEntries(
    [...samples.entries()].map(([role, values]) => {
      const recent = values.slice(-ROLE_ESTIMATE_SAMPLE_SIZE);
      return [role, recent.reduce((total, value) => total + value, 0) / recent.length];
    }),
  );
}

export async function readRoleCostEstimates(): Promise<Record<string, number>> {
  const journalPath = costJournalPath();
  if (!existsSync(journalPath)) {
    return {};
  }

  try {
    const content = await readFile(journalPath, 'utf-8');
    return estimateRoleCostsUsd(content);
  } catch {
    return {};
  }
}

export async function readCostJournalSummary(now = new Date()): Promise<CostJournalSummary> {
  const journalPath = costJournalPath();
  if (!existsSync(journalPath)) {
    return emptyCostJournalSummary;
  }

  try {
    const content = await readFile(journalPath, 'utf-8');
    return summarizeCostJournal(content, now);
  } catch {
    return emptyCostJournalSummary;
  }
}

export function readDailyCostCapUsd(): number {
  const raw = process.env.ORCHESTRATOR_COST_CAP_USD;
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_DAILY_COST_CAP_USD;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_DAILY_COST_CAP_USD;
}

export async function readBurnMeterData(now = new Date()): Promise<BurnMeterData> {
  const summary = await readCostJournalSummary(now);
  return {
    capUsd: readDailyCostCapUsd(),
    todayUsd: summary.todayUsd,
  };
}

function costJournalPath(): string {
  const explicitPath = process.env.ORCHESTRATOR_COST_JOURNAL_PATH;
  if (explicitPath !== undefined && explicitPath.trim() !== '') {
    return resolve(explicitPath);
  }

  return join(vaultRoot(), '06-progress', 'cost-journal.jsonl');
}

function vaultRoot(): string {
  const explicitPath = process.env.ORCHESTRATOR_VAULT_PATH;
  if (explicitPath !== undefined && explicitPath.trim() !== '') {
    return resolve(explicitPath);
  }

  const cwdVault = resolve(process.cwd(), '.vault');
  if (existsSync(cwdVault)) {
    return cwdVault;
  }

  return resolve(dirname(fileURLToPath(import.meta.url)), '../../..', '.vault');
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}
